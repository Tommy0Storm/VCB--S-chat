# VCB-CHAT - Sovereign AI for African Jurisprudence

**⚠️ PROPRIETARY SOFTWARE - ALL RIGHTS RESERVED ⚠️**

A premium legal tech AI platform with 1 million token context, trained for South African law and multilingual support (11 official languages).

**Copyright © 2025 VCB-AI (Pty) Ltd**
CEO: Ms Dawn Beech | Website: [vcb-ai.online](https://vcb-ai.online)
Pretoria Datacenter, South Africa

---

## 🔒 STRICT PROPRIETARY LICENSE

**THIS REPOSITORY IS PUBLICLY VISIBLE FOR DEMONSTRATION PURPOSES ONLY.**

❌ **YOU MAY NOT:**
- Copy, modify, or distribute this code
- Use this code commercially without written permission
- Create derivative works or extract algorithms
- Train AI models using this codebase
- Remove proprietary notices

✅ **READ THE FULL LICENSE:** [LICENSE](./LICENSE)

**Unauthorized use constitutes copyright infringement under South African law.**

For licensing inquiries: info@vcb-ai.online

---

## Features

- Real-time chat interface with VCB AI
- Modern, responsive UI built with React and Tailwind CSS
- TypeScript for type safety
- Beautiful dark theme with smooth animations
- Message history tracking
- Loading states and error handling
- Auto-scroll to latest messages
- Keyboard shortcuts (Enter to send, Shift+Enter for new line)

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A VCB API key (get one at [https://cloud.VCB.ai/](https://cloud.VCB.ai/))

## Installation

1. Clone or navigate to this repository:
```bash
cd VCB-chat
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables:
   - Copy `.env.example` to `.env`
   - Add your VCB API key to the `.env` file:
```
VITE_VCB_API_KEY=your_actual_api_key_here
```

## Running the Application

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Building for Production

To create a production build:
```bash
npm run build
```

To preview the production build:
```bash
npm run preview
```

## Project Structure

```
VCB-chat/
├── src/
│   ├── App.tsx          # Main chat component
│   ├── main.tsx         # Application entry point
│   └── index.css        # Global styles with Tailwind
├── public/              # Static assets
├── .env                 # Environment variables (not committed)
├── .env.example         # Environment variables template
├── index.html           # HTML template
├── package.json         # Dependencies and scripts
├── tailwind.config.js   # Tailwind CSS configuration
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite configuration
```

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **VCB Cloud SDK** - AI API integration
- **Llama 3.1** - AI model (8B parameter version)

## Usage Tips

- Press **Enter** to send a message
- Press **Shift+Enter** to add a new line in your message
- Messages are displayed with user avatars (U for user, AI for assistant)
- The chat automatically scrolls to the latest message
- Loading animation appears while waiting for AI response

## Security Notes

- Never commit your `.env` file to version control
- Keep your API key secure and don't share it publicly
- The `.gitignore` file is configured to exclude `.env` files

## Troubleshooting

### API Key Error
If you see "VITE_VCB_API_KEY not found", make sure:
1. You created the `.env` file in the project root
2. The API key is properly set in the `.env` file
3. You restart the dev server after changing `.env`

### Build Errors
If you encounter build errors:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## License

**PROPRIETARY - SEE [LICENSE](./LICENSE) FILE**

This software is protected by South African copyright law and international treaties.
Unauthorized reproduction or distribution is strictly prohibited.

## Support

For issues with:
- This application: Check the code or create an issue
- VCB API: Visit [VCB documentation](https://cloud.VCB.ai/docs)
- React/Vite: Check their respective documentation
