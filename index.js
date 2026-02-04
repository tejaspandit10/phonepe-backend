import express from "express";
import cors from "cors";
import crypto from "crypto";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


// ------------------------------------
// Create PhonePe payment
// ------------------------------------
app.post("/api/phonepe/create-payment", async (req, res) => {
  try {

    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: "Amount missing" });
    }

    const merchantTransactionId = "MT" + Date.now();

    const payload = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      merchantTransactionId,
      merchantUserId: "USER1",
      amount: Number(amount) * 100, // in paise
      redirectUrl: `${process.env.BASE_URL}/api/phonepe/callback`,
      redirectMode: "POST",
      callbackUrl: `${process.env.BASE_URL}/api/phonepe/callback`,
      paymentInstrument: {
        type: "PAY_PAGE"
      }
    };

    const base64Payload = Buffer
      .from(JSON.stringify(payload))
      .toString("base64");

    const stringToSign =
      base64Payload + "/pg/v1/pay" + process.env.PHONEPE_SALT_KEY;

    const sha256 = crypto
      .createHash("sha256")
      .update(stringToSign)
      .digest("hex");

    const checksum = sha256 + "###" + process.env.PHONEPE_SALT_INDEX;

    const phonepeRes = await axios.post(
      "https://api.phonepe.com/apis/hermes/pg/v1/pay",
      {
        request: base64Payload
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum
        }
      }
    );

    const redirectUrl =
      phonepeRes.data?.data?.instrumentResponse?.redirectInfo?.url;

    res.json({
      success: true,
      merchantTransactionId,
      redirectUrl
    });

  } catch (error) {

    console.log("PhonePe create error:",
      error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "Failed to create PhonePe payment"
    });
  }
});


// ------------------------------------
// PhonePe redirect / callback
// ------------------------------------
app.post("/api/phonepe/callback", (req, res) => {

  // Do NOT trust this directly
  // Always verify using status API from frontend or backend

  res.redirect(process.env.FRONTEND_SUCCESS_URL);
});


// ------------------------------------
// Check payment status
// ------------------------------------
app.get("/api/phonepe/status/:txnId", async (req, res) => {
  try {

    const txnId = req.params.txnId;

    const path =
      `/pg/v1/status/${process.env.PHONEPE_MERCHANT_ID}/${txnId}`;

    const stringToSign = path + process.env.PHONEPE_SALT_KEY;

    const sha256 = crypto
      .createHash("sha256")
      .update(stringToSign)
      .digest("hex");

    const checksum = sha256 + "###" + process.env.PHONEPE_SALT_INDEX;

    const url = `https://api.phonepe.com/apis/hermes${path}`;

    const phonepeRes = await axios.get(url, {
      headers: {
        "X-VERIFY": checksum,
        "X-MERCHANT-ID": process.env.PHONEPE_MERCHANT_ID
      }
    });

    res.json(phonepeRes.data);

  } catch (error) {

    console.log("PhonePe status error:",
      error.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "Failed to check payment status"
    });
  }
});


// ------------------------------------

app.get("/", (req, res) => {
  res.send("PhonePe backend running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
