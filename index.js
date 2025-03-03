const express = require("express");
const { nanoid } = require("nanoid");
const smpp = require("smpp");

const app = express();
app.use(express.json());

smpp.addTLV("billing_price", {
  id: 0x1520,
  type: smpp.types.tlv.string,
});

smpp.addTLV("billed_msgs_cnt", {
  id: 0x1521,
  type: smpp.types.tlv.string,
});

const connectSMPP = (config) => {
  const session = smpp.connect(config.host);

  session.bind_transceiver(
    {
      system_id: config.system_id,
      password: config.password,
    },
    (pdu) => {
      if (pdu.command_status !== 0) {
        console.error("SMPP binding failed");
      }
    }
  );

  session.on("error", (err) => {
    console.error("SMPP Error:", err);
  });

  return session;
};

const sendSMS = async (session, source, to, message) => {
  return new Promise((resolve, reject) => {
    const messageId = nanoid(24);

    session.submit_sm(
      {
        destination_addr: to,
        source_addr_ton: 5,
        source_addr_npi: 0,
        dest_addr_ton: 1,
        dest_addr_npi: 1,
        source_addr: source,
        registered_delivery: 1,
        message_id: messageId,
        short_message: message,
      },
      (pdu) => {
        if (pdu.command_status === 0) {
          resolve({ success: true, messageId });
        } else {
          reject({ success: false, error: "Message sending failed" });
        }
      }
    );
  });
};

app.post("/api/send-sms", async (req, res) => {
  try {
    const { host, system_id, password, to, message } = req.body;

    if (!host || !system_id || !password || !to || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const smppConfig = { host, system_id, password };
    const source = system_id;

    const session = connectSMPP(smppConfig);

    const result = await sendSMS(session, source, to, message);

    session.on("deliver_sm", (pdu) => {
      if (pdu.esm_class === 4) {
        console.log("Delivery Receipt:", pdu.short_message);
        session.send(pdu.response());
      }
    });

    session.on("pdu", (pdu) => {
      console.log("PDU Received:", pdu);
    });

    res.json(result);
  } catch (error) {
    res.status(500).json(error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
