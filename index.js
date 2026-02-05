import express from "express";
import axios from "axios";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
const SALT_KEY = process.env.PHONEPE_SALT_KEY;
const SALT_INDEX = process.env.PHONEPE_SALT_INDEX;

// ----------------------------
// Health check
// ----------------------------
app.get("/", (req, res) => {
  res.send("PhonePe backend running");
});

// ----------------------------
// Create payment
// ----------------------------
app.post("/pay", async (req, res) => {
  try {
    const { amount } = req.body;

    const merchantTransactionId = "MT" + Date.now();

    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId,
      merchantUserId: "MUID123",
      amount: amount * 100, // rupees -> paise
      redirectUrl: `${process.env.BASE_URL}/status/${merchantTransactionId}`,
      redirectMode: "REDIRECT",
      callbackUrl: `${process.env.BASE_URL}/status/${merchantTransactionId}`,
      paymentInstrument: {
        type: "PAY_PAGE"
      }
    };

    const payloadString = JSON.stringify(payload);
    const base64Payload = Buffer.from(payloadString).toString("base64");

    const stringToSign =
      base64Payload + "/pg/v1/pay" + SALT_KEY;

    const sha256 = crypto
      .createHash("sha256")
      .update(stringToSign)
      .digest("hex");

    const checksum = sha256 + "###" + SALT_INDEX;

    const response = await axios.post(
      "https://api-preprod.phonepe.com/apis/hermes/pg/v1/pay",
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

    res.json(response.data);

  } catch (error) {
    console.error(error?.response?.data || error.message);
    res.status(500).json({
      error: error?.response?.data || "Payment init failed"
    });
  }
});

// ----------------------------
// Payment status
// ----------------------------
app.get("/status/:txnId", async (req, res) => {

  const { txnId } = req.params;

  const path = `/pg/v1/status/${MERCHANT_ID}/${txnId}`;

  const stringToSign = path + SALT_KEY;

  const sha256 = crypto
    .createHash("sha256")
    .update(stringToSign)
    .digest("hex");

  const checksum = sha256 + "###" + SALT_INDEX;

  try {
    const response = await axios.get(
      `https://api-preprod.phonepe.com/apis/hermes${path}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": MERCHANT_ID
        }
      }
    );

    const successUrl = process.env.FRONTEND_SUCCESS_URL;

    return res.redirect(successUrl);

  } catch (error) {
    console.error(error?.response?.data || error.message);
    res.status(500).send("Status check failed");
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
