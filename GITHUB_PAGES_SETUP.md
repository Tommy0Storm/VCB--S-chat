# Quick GitHub Pages Setup

## 🚀 5-Minute Deployment

### 1. Push to GitHub
```bash
git add .
git commit -m "Setup GitHub Pages"
git push origin main
```

### 2. Enable GitHub Pages
- Go to **Settings** → **Pages**
- Source: **GitHub Actions**

### 3. Add 4 Secrets
Go to **Settings** → **Secrets and variables** → **Actions**

Click **New repository secret** for each:

```
Name: VITE_CEREBRAS_API_KEY
Secret: [paste your Cerebras key]

Name: VITE_DEEPINFRA_API_KEY
Secret: [paste your DeepInfra key]

Name: VITE_SERPAPI_KEY
Secret: [paste your SerpAPI key]

Name: VITE_WEATHER_API_KEY
Secret: [paste your WeatherAPI key]
```

### 4. Update Base Path
Edit `vite.config.ts`:
```typescript
base: '/your-repo-name/',  // e.g., '/vcb-chat/'
```

### 5. Deploy
```bash
git add vite.config.ts
git commit -m "Update base path"
git push origin main
```

### ✅ Done!
Your site will be live at:
```
https://your-username.github.io/your-repo-name/
```

Check deployment status: **Actions** tab

---

## 📋 Get API Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| Cerebras | https://cloud.cerebras.ai/ | Yes |
| DeepInfra | https://deepinfra.com/ | Yes |
| SerpAPI | https://serpapi.com/ | 100/month |
| WeatherAPI | https://www.weatherapi.com/ | 1M/month |

---

## 🔧 Local Development

```bash
cp .env.example .env
# Add your keys to .env
npm install
npm run dev
```

---

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
