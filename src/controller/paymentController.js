const crypto = require("crypto");
const Razorpay = require("razorpay");
const { pool } = require("../config/db");

const listMyEnrollments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT course_slug AS slug, course_title AS title
       FROM public.enrollments
       WHERE user_id = $1
       ORDER BY id DESC`,
      [req.user.id],
    );

    return res.json({ success: true, enrollments: result.rows });
  } catch (error) {
    console.error("List enrollments error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load your enrolled courses",
    });
  }
};

const createCourseOrder = async (req, res) => {
  try {
    // Sirf students course khareed sakte hain.
    if (req.user?.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can purchase courses",
      });
    }

    const { courseSlug } = req.body;

    if (!courseSlug || typeof courseSlug !== "string") {
      return res.status(400).json({
        success: false,
        message: "Course slug is required",
      });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Payment gateway is not configured",
      });
    }

    // Price hamesha database se lenge, request body se nahi.
    const courseResult = await pool.query(
      `SELECT slug, title, price_paise
       FROM public.courses
       WHERE slug = $1 AND is_active = TRUE`,
      [courseSlug],
    );

    const course = courseResult.rows[0];

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const enrollmentResult = await pool.query(
      `SELECT id
       FROM public.enrollments
       WHERE user_id = $1 AND course_slug = $2`,
      [req.user.id, course.slug],
    );

    if (enrollmentResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "You are already enrolled in this course",
      });
    }

    const amountPaise = Number(course.price_paise);

    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      return res.status(500).json({
        success: false,
        message: "Course price is invalid",
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `crs_${crypto.randomUUID().replaceAll("-", "")}`,
      notes: {
        user_id: String(req.user.id),
        course_slug: course.slug,
      },
    });

    await pool.query(
      `INSERT INTO public.payment_orders
        (user_id, course_slug, course_title, amount_paise, currency,
         razorpay_order_id, status)
       VALUES ($1, $2, $3, $4, 'INR', $5, 'created')`,
      [
        req.user.id,
        course.slug,
        course.title,
        amountPaise,
        razorpayOrder.id,
      ],
    );

    return res.status(201).json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        courseTitle: course.title,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("Create course order error:", error.stack || error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create payment order",
    });
  }
};

const verifyCoursePayment = async (req, res) => {
  let client;

  try {
    if (req.user?.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can verify course payments",
      });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !/^[a-f0-9]{64}$/i.test(razorpay_signature)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification details are invalid",
      });
    }

    const orderResult = await pool.query(
      `SELECT id, user_id, course_slug, course_title, amount_paise,
              currency, razorpay_order_id, status
       FROM public.payment_orders
       WHERE razorpay_order_id = $1 AND user_id = $2`,
      [razorpay_order_id, req.user.id],
    );

    const order = orderResult.rows[0];

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${order.razorpay_order_id}|${razorpay_payment_id}`)
      .digest();

    const receivedSignature = Buffer.from(razorpay_signature, "hex");

    if (
      receivedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment signature is invalid",
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (
      payment.order_id !== order.razorpay_order_id ||
      Number(payment.amount) !== Number(order.amount_paise) ||
      payment.currency !== String(order.currency).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment details do not match the order",
      });
    }

    if (payment.status !== "captured") {
      if (payment.status === "failed") {
        await pool.query(
          `UPDATE public.payment_orders
           SET status = 'failed', updated_at = NOW()
           WHERE id = $1 AND status <> 'paid'`,
          [order.id],
        );
      }

      return res.status(202).json({
        success: false,
        enrolled: false,
        paymentStatus: payment.status,
        message: "Payment is not captured yet",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const lockedResult = await client.query(
      `SELECT id, status
       FROM public.payment_orders
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [order.id, req.user.id],
    );

    const lockedOrder = lockedResult.rows[0];

    if (!lockedOrder) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Payment order not found",
      });
    }

    if (lockedOrder.status === "paid") {
      await client.query("COMMIT");
      return res.json({
        success: true,
        enrolled: true,
        message: "Payment was already verified",
      });
    }

    await client.query(
      `UPDATE public.payment_orders
       SET status = 'paid',
           razorpay_payment_id = $1,
           paid_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [razorpay_payment_id, order.id],
    );

    await client.query(
      `INSERT INTO public.enrollments
         (user_id, course_slug, course_title, payment_order_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, course_slug) DO NOTHING`,
      [order.user_id, order.course_slug, order.course_title, order.id],
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      enrolled: true,
      courseSlug: order.course_slug,
      message: "Payment verified and enrollment activated",
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Verify course payment error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
    });
  } finally {
    client?.release();
  }
};

const handleRazorpayWebhook = async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.get("x-razorpay-signature");
    const eventId = req.get("x-razorpay-event-id");

    if (!webhookSecret) {
      return res.status(500).json({
        success: false,
        message: "Webhook is not configured",
      });
    }

    if (
      !Buffer.isBuffer(req.body) ||
      !signature ||
      !/^[a-f0-9]{64}$/i.test(signature) ||
      !eventId
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook request",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body)
      .digest();

    const receivedSignature = Buffer.from(signature, "hex");

    if (
      receivedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    let event;

    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload",
      });
    }

    if (!event.event) {
      return res.status(400).json({
        success: false,
        message: "Webhook event type is missing",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const savedEvent = await client.query(
      `INSERT INTO public.razorpay_webhook_events (event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, event.event],
    );

    // Razorpay may retry the same event. Acknowledge it without reprocessing.
    if (savedEvent.rows.length === 0) {
      await client.query("COMMIT");
      transactionStarted = false;
      return res.json({ success: true, duplicate: true });
    }

    const payment = event.payload?.payment?.entity;

    if (event.event === "payment.captured") {
      if (!payment?.order_id || !payment?.id) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "Captured payment details are missing",
        });
      }

      const result = await client.query(
        `SELECT id, user_id, course_slug, course_title,
                amount_paise, currency, status
         FROM public.payment_orders
         WHERE razorpay_order_id = $1
         FOR UPDATE`,
        [payment.order_id],
      );

      const order = result.rows[0];

      if (
        !order ||
        Number(payment.amount) !== Number(order.amount_paise) ||
        payment.currency !== String(order.currency).trim()
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "Captured payment does not match an order",
        });
      }

      await client.query(
        `UPDATE public.payment_orders
         SET status = 'paid',
             razorpay_payment_id = $1,
             paid_at = COALESCE(paid_at, NOW()),
             updated_at = NOW()
         WHERE id = $2`,
        [payment.id, order.id],
      );

      await client.query(
        `INSERT INTO public.enrollments
           (user_id, course_slug, course_title, payment_order_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, course_slug) DO NOTHING`,
        [order.user_id, order.course_slug, order.course_title, order.id],
      );
    }

    if (event.event === "payment.failed" && payment?.order_id) {
      await client.query(
        `UPDATE public.payment_orders
         SET status = 'failed', updated_at = NOW()
         WHERE razorpay_order_id = $1 AND status <> 'paid'`,
        [payment.order_id],
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({ success: true, received: true });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Razorpay webhook error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to process webhook",
    });
  } finally {
    client?.release();
  }
};

module.exports = { 
    listMyEnrollments,
    createCourseOrder,
    verifyCoursePayment,
    handleRazorpayWebhook
};
