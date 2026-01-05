# Outdoor SMS Assistant

An SMS-based survival and outdoor AI assistant built with Node.js, TypeScript, Twilio, and OpenAI.

Send an SMS, receive safety-focused outdoor advice. No mobile app. No web UI. Just SMS.

---

## Features

- **Double Opt-In**: Users must confirm with "YES" before activation
- **Session Management**: Maintains context of the last 3 messages for 30 minutes
- **Safety-First AI**: Strictly limited to outdoor/survival topics with conservative advice
- **MORE Command**: Users can request expanded details on the previous response
- **SMS-Only**: Designed for reliable communication in the field

---

## Tech Stack

- **Node.js** + **TypeScript**
- **Express** - Web server
- **Twilio** - SMS sending/receiving
- **OpenAI API** - AI responses (GPT-4 Turbo)
- **SQLite** - Local database for users and sessions
- **dotenv** - Environment configuration

---

## Prerequisites

1. **Node.js** (v18 or higher)
2. **npm** or **yarn**
3. **Twilio Account** ([sign up here](https://www.twilio.com/try-twilio))
   - Account SID
   - Auth Token
   - Twilio Phone Number
4. **OpenAI API Key** ([get one here](https://platform.openai.com/api-keys))
5. **ngrok** (for local webhook testing) ([download here](https://ngrok.com/download))

---

## Installation

### 1. Clone or Create Project

```bash
cd outdoor-sms-assistant
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

OPENAI_API_KEY=your_openai_api_key_here

PORT=3000
NODE_ENV=development
```

### 4. Build the Project

```bash
npm run build
```

---

## Running Locally

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`.

---

## Exposing Your Local Server with ngrok

Twilio needs a public URL to send webhook requests. Use **ngrok** to expose your local server.

### 1. Start Your Server

```bash
npm run dev
```

### 2. Start ngrok

In a separate terminal:

```bash
ngrok http 3000
```

You'll see output like:

```
Forwarding   https://abc123.ngrok.io -> http://localhost:3000
```

Copy the `https://` URL (e.g., `https://abc123.ngrok.io`).

---

## Configuring Twilio

### 1. Log in to Twilio Console

Go to: [https://console.twilio.com/](https://console.twilio.com/)

### 2. Navigate to Your Phone Number

- Go to **Phone Numbers** → **Manage** → **Active Numbers**
- Click on your Twilio phone number

### 3. Configure Messaging Webhook

Under **Messaging Configuration**:

- **A MESSAGE COMES IN**: Set to `Webhook`
- **URL**: Enter your ngrok URL + `/sms/incoming`
  - Example: `https://abc123.ngrok.io/sms/incoming`
- **HTTP Method**: `POST`

Click **Save**.

---

## Testing the System

### Test 1: First-Time User (Opt-In)

**Send SMS to your Twilio number:**

```
Hello
```

**Expected Response:**

```
Reply YES to activate the Outdoor Assistant. For emergencies, contact local rescue services.
```

### Test 2: Activate User

**Send SMS:**

```
YES
```

**Expected Response:**

```
Outdoor Assistant activated! Ask me about navigation, weather, wilderness first aid, or camping safety. Reply MORE to expand any answer.
```

### Test 3: Ask a Question

**Send SMS:**

```
How do I purify water in the wilderness?
```

**Expected Response (example):**

```
• Assume all natural water sources contain harmful pathogens
• Boil for 1 minute (3 minutes above 6,500 ft)
• Or use water filter rated for bacteria & protozoa
• Chemical tablets work but take 30+ min
• When in doubt, don't drink untreated water
```

### Test 4: Request More Information

**Send SMS:**

```
MORE
```

**Expected Response:**

Expanded detail on the previous answer.

### Test 5: Session Context

The system remembers your last 3 messages for 30 minutes. Try asking follow-up questions:

**Send SMS:**

```
What about snow?
```

The AI will understand the context from your previous messages.

---

## Project Structure

```
outdoor-sms-assistant/
├── src/
│   ├── server.ts              # Entry point, starts Express server
│   ├── app.ts                 # Express app setup and middleware
│   ├── routes/
│   │   └── sms.ts             # SMS webhook endpoint and routing logic
│   ├── services/
│   │   ├── userService.ts     # User management (opt-in, activation)
│   │   ├── sessionService.ts  # Session handling (context, expiry)
│   │   ├── aiService.ts       # OpenAI integration
│   │   └── twilioService.ts   # Twilio SMS sending
│   ├── prompts/
│   │   └── survivalSystemPrompt.ts  # AI safety rules and behavior
│   ├── db/
│   │   └── database.ts        # SQLite database wrapper
│   └── utils/
│       ├── text.ts            # Text processing utilities
│       └── time.ts            # Time/date utilities
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  phone_number TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Sessions Table

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]',  -- JSON array of last 3 messages
  last_ai_response TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (phone_number) REFERENCES users(phone_number)
);
```

---

## API Endpoints

### `GET /health`

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-04T12:00:00.000Z",
  "service": "outdoor-sms-assistant"
}
```

### `POST /sms/incoming`

Twilio webhook for incoming SMS messages.

**Request Body (from Twilio):**

```
From=+1234567890
Body=Hello
```

**Response:**

```
200 OK
```

---

## AI Behavior & Safety

The AI assistant is **strictly limited** to:

- Outdoor navigation & time estimation
- Weather interpretation & environmental risk
- Basic wilderness first aid (non-diagnostic)
- Camp, shelter, water, and food safety
- Conservative go/no-go decision support

### AI Response Rules

- Max 5 bullet points per reply
- Short, SMS-friendly sentences
- Calm, conservative tone
- Never encourages risky behavior
- If uncertain → recommends the safest option
- For medical/dangerous situations → advises emergency services

### Out-of-Scope Requests

The AI will **refuse** and redirect:

- Medical diagnosis or treatment
- Legal advice
- Topics outside outdoor/survival
- Requests encouraging dangerous behavior

---

## Logging

All events are logged to the console:

- `[SMS]` - Incoming/outgoing SMS messages
- `[USER]` - User creation, activation
- `[SESSION]` - Session creation, updates, expiry
- `[AI]` - AI prompt context and responses
- `[TWILIO]` - Twilio API calls
- `[DATABASE]` - Database initialization
- `[ERROR]` - Errors and exceptions

---

## Session Expiry

- Sessions automatically expire after **30 minutes** of inactivity
- After expiry, a new session is created with the next message
- Context is not preserved across expired sessions

---

## Security Considerations

### For Production Deployment

1. **Enable Twilio Request Validation**
   - Verify webhook signatures to prevent spoofing
   - See: [Twilio Security Docs](https://www.twilio.com/docs/usage/security)

2. **Use HTTPS**
   - Deploy behind a reverse proxy with SSL/TLS
   - ngrok provides HTTPS automatically

3. **Environment Variables**
   - Never commit `.env` to version control
   - Use secure secret management in production

4. **Rate Limiting**
   - Add rate limiting middleware to prevent abuse
   - Consider per-user message limits

5. **Database Backups**
   - Regularly backup `outdoor-assistant.db`
   - Consider using PostgreSQL for production

---

## Troubleshooting

### "Missing required environment variable"

- Check that your `.env` file exists and contains all required variables
- Ensure there are no spaces around `=` in the `.env` file

### "Failed to send SMS"

- Verify your Twilio credentials are correct
- Check that your Twilio phone number is in E.164 format: `+1234567890`
- Ensure your Twilio account has sufficient credits

### "Failed to generate AI response"

- Verify your OpenAI API key is valid
- Check your OpenAI account has available credits
- Review console logs for specific error messages

### Webhook not receiving messages

- Ensure ngrok is running and forwarding to your local server
- Verify the webhook URL in Twilio console is correct
- Check that the URL includes `/sms/incoming`
- Test the health check: `curl https://your-ngrok-url.ngrok.io/health`

### Session context not working

- Sessions expire after 30 minutes of inactivity
- Only the last 3 user messages are kept in context
- Check console logs for `[SESSION]` events

---

## Future Enhancements

- [ ] Support for MMS (images of landmarks, injuries, etc.)
- [ ] Location-based weather and trail conditions
- [ ] Multi-language support
- [ ] Voice message transcription
- [ ] Integration with emergency services APIs
- [ ] User preferences and settings
- [ ] Analytics dashboard

---

## License

MIT License

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## Support

For issues or questions:

- Review the [Twilio SMS Documentation](https://www.twilio.com/docs/sms)
- Check [OpenAI API Documentation](https://platform.openai.com/docs)
- Open an issue in this repository

---

## Disclaimer

**This assistant is NOT a substitute for:**

- Professional medical advice, diagnosis, or treatment
- Emergency services (always call 911 or local rescue in emergencies)
- Proper outdoor training and preparation
- Personal judgment and risk assessment

Always prioritize safety and seek professional help when needed.

---

**Built with ❤️ for the outdoor community**
