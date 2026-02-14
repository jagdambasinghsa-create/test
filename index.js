const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const axios = require("axios");
const fs = require("fs-extra");
const AdmZip = require("adm-zip");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// ================= CONFIG =================
const TOKEN = "8405208571:AAHn8LtvbETwaZYFUiOKKOvvPD1miqPpn54";
const ADMIN_CHAT_ID = "-5119915168";
const DASHBOARD_BASE_URL = "https://firebasepassword.onrender.com";
const PORT = process.env.PORT || 3000;
// ==========================================

// ===== BOT INIT =====
const bot = new TelegramBot(TOKEN, { polling: true });

bot.on("polling_error", (err) => console.log("Polling Error:", err.response?.body || err.message));
bot.on("error", console.log);

bot.getMe().then(me => console.log("Bot connected as:", me.username)).catch(console.log);

// ===== EXPRESS INIT =====
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let dashboardData = {};

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Dashboard route
app.get("/view/:chatId/:id", (req, res) => {
  const { chatId, id } = req.params;
  const userData = dashboardData[chatId]?.find(d => d.id === id);

  if (!userData) return res.send("<h2>Data not found!</h2>");

  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ================= HELPERS =================
function prepareFirebaseURL(url) {
  if (!url) return null;
  if (!url.endsWith(".json")) {
    if (url.endsWith("/")) return url + ".json";
    return url + "/.json";
  }
  return url;
}

// ================= BOT HANDLERS =================

// /start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
`👋
Welcome!

Agar telegram bot band ho gaya hai
URL se start kar lena
👇👇👇👇👇👇👇
${DASHBOARD_BASE_URL}

Developer by: -@heck0bot\n

Please send APK file only.`);
});

// General message handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  // Ignore /start duplicate
  if (msg.text && msg.text.startsWith("/start")) return;

  let type = "TEXT";
  if (msg.document && msg.document.file_name?.toLowerCase().endsWith(".apk")) type = "APK";
  else if (msg.document) type = "DOCUMENT";
  else if (msg.photo) type = "PHOTO";

  // Forward original message to admin first
  let forwardedMessageId = null;
  try {
    const forwarded = await bot.forwardMessage(ADMIN_CHAT_ID, chatId, msg.message_id);
    forwardedMessageId = forwarded.message_id;
  } catch (e) {
    console.log("Forward failed:", e.message);
  }

  // If not APK, send warning
  if (type !== "APK") {
    await bot.sendMessage(chatId, "Developer by :- @heck0bot\n\n⚠️ सीधे बोट को एक admin apk फाइल भेजें।\nSend an admin apk file to the bot directly\n直接将 admin APK文件发送给机器人\nأرسل ملف admin APK إلى البوت مباشرة.");

    await bot.sendMessage(
      ADMIN_CHAT_ID,
      `📩 New Message
Customer: ${msg.from.first_name} (@${msg.from.username || "N/A"})
Chat ID: ${chatId}
Type: ${type}
Time: ${new Date().toLocaleString()}`,
      { reply_to_message_id: forwardedMessageId }
    );
    return;
  }

  // ================= APK PROCESS =================
  const apkName = msg.document.file_name;
  // Initial processing message
  const processingMsg = await bot.sendMessage(chatId, "📥 Downloading APK...");

  try {
    const file = await bot.getFile(msg.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    const apkPath = path.join(__dirname, "temp.apk");
    const extractPath = path.join(__dirname, "extracted");

    if (fs.existsSync(apkPath)) fs.removeSync(apkPath);
    if (fs.existsSync(extractPath)) fs.removeSync(extractPath);

    // Download APK
    const response = await axios({ url: fileUrl, method: "GET", responseType: "stream", timeout: 30000 });
    const writer = fs.createWriteStream(apkPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => { writer.on("finish", resolve); writer.on("error", reject); });

    await bot.editMessageText("📦 Extracting APK...", { chat_id: chatId, message_id: processingMsg.message_id });

    // Extract APK
    const zip = new AdmZip(apkPath);
    zip.extractAllTo(extractPath, true);

    // Search Firebase URL recursively
    function searchFirebase(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const result = searchFirebase(fullPath);
          if (result) return result;
        } else {
          try {
            const content = fs.readFileSync(fullPath, "utf8");
            const match = content.match(/https:\/\/[^\s"]*(firebaseio\.com|firebasedatabase\.app|firebaseapp\.com)/);
            if (match) return match[0];
          } catch {}
        }
      }
      return null;
    }
    const firebaseUrl = searchFirebase(extractPath);

    // Cleanup
    fs.removeSync(apkPath);
    fs.removeSync(extractPath);

    // Save to dashboard
    if (!dashboardData[chatId]) dashboardData[chatId] = [];
    const id = uuidv4();
    const dashboardUrl = `${DASHBOARD_BASE_URL}/view/${chatId}/${id}?url=${firebaseUrl || "N/A"}`;
    dashboardData[chatId].push({ id, apkName, firebaseUrl, timestamp: new Date().toLocaleString() });

    // ---------------- CUSTOMER REPLY ----------------
    await bot.editMessageText(
      `✅ Processing Complete!\nPenal to chud gaya\nDeveloper by :- @heck0bot\nAgar telegram bot band ho raha hai\n URL se start kar lena\n👇👇👇👇👇👇👇\n
This URL expires in 1 hour.

View Result:
${dashboardUrl}`,
      { 
        chat_id: chatId, 
        message_id: processingMsg.message_id,
        reply_to_message_id: msg.message_id // attach to original APK
      }
    );

    // ---------------- ADMIN REPLY ----------------
    await bot.sendMessage(
      ADMIN_CHAT_ID,
      `📩 Reply sent to customer
Customer: ${msg.from.first_name} (@${msg.from.username || "N/A"})
Chat ID: ${chatId}
File: ${apkName}
Firebase: ${prepareFirebaseURL(firebaseUrl) || "Not Found"}
Dashboard: ${dashboardUrl}
Time: ${new Date().toLocaleString()}`,
      { reply_to_message_id: forwardedMessageId }
    );

  } catch (err) {
    console.log("APK Processing Error:", err.message);
    await bot.editMessageText("⚠️ Error processing APK.", { chat_id: chatId, message_id: processingMsg.message_id });
  }
});
