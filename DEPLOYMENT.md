# GitHub Pages Deployment Guide

## Prerequisites
- GitHub account
- Repository pushed to GitHub
- All API keys ready

## Step 1: Configure Repository Settings

1. Go to your GitHub repository
2. Click **Settings** → **Pages**
3. Under **Source**, select **GitHub Actions**

## Step 2: Add GitHub Secrets

Go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 4 secrets:

| Secret Name | Description | Get From |
|-------------|-------------|----------|
| `VITE_CEREBRAS_API_KEY` | AI chat functionality | https://cloud.cerebras.ai/ |
| `VITE_DEEPINFRA_API_KEY` | Image generation | https://deepinfra.com/ |
| `VITE_SERPAPI_KEY` | Web search & local places | https://serpapi.com/ |
| `VITE_WEATHER_API_KEY` | Weather forecasts | https://www.weatherapi.com/ |

### How to Add Each Secret:
1. Click **New repository secret**
2. Enter the **Name** (e.g., `VITE_CEREBRAS_API_KEY`)
3. Paste your API key in **Secret**
4. Click **Add secret**
5. Repeat for all 4 keys

## Step 3: Update Base Path (if needed)

In `vite.config.ts`, update the `base` to match your repository name:

```typescript
export default defineConfig({
  plugins: [react()],
  base: '/your-repo-name/',  // Change this to your actual repo name
})
```

For example:
- Repo: `https://github.com/username/vcb-chat`
- Base: `base: '/vcb-chat/'`

## Step 4: Deploy

### Automatic Deployment (Recommended)
Push to the `main` branch:
```bash
git add .
git commit -m "Setup GitHub Pages deployment"
git push origin main
```

The GitHub Action will automatically:
1. Build your app with the secret API keys
2. Deploy to GitHub Pages
3. Your site will be live at: `https://username.github.io/repo-name/`

### Manual Deployment (Alternative)
```bash
npm run deploy
```

## Step 5: Verify Deployment

1. Go to **Actions** tab in your repository
2. Check the workflow run status
3. Once complete, visit your site: `https://username.github.io/repo-name/`

## Troubleshooting

### Build Fails
- Check that all 4 secrets are added correctly
- Verify secret names match exactly (case-sensitive)
- Check the Actions log for specific errors

### 404 Error
- Verify `base` path in `vite.config.ts` matches your repo name
- Ensure it starts and ends with `/`

### API Keys Not Working
- Secrets are only available during build time
- Check that environment variables use `VITE_` prefix
- Verify keys are valid on their respective platforms

### Page Not Updating
- Clear browser cache
- Wait a few minutes for GitHub Pages to update
- Check Actions tab for deployment status

## Local Development

For local development, create a `.env` file:
```bash
cp .env.example .env
```

Add your API keys to `.env`:
```env
VITE_CEREBRAS_API_KEY=your_key_here
VITE_DEEPINFRA_API_KEY=your_key_here
VITE_SERPAPI_KEY=your_key_here
VITE_WEATHER_API_KEY=your_key_here
```

Run locally:
```bash
npm run dev
```

## Security Notes

✅ **Safe**: API keys in GitHub Secrets (encrypted)
✅ **Safe**: Keys injected at build time only
⚠️ **Warning**: Built files contain API keys (client-side app)
⚠️ **Recommendation**: Use API key restrictions on provider platforms

### Protect Your Keys:
- **Cerebras**: Set usage limits
- **DeepInfra**: Set spending limits
- **SerpAPI**: Set monthly search limits
- **WeatherAPI**: Free tier has built-in limits

## Custom Domain (Optional)

1. Go to **Settings** → **Pages**
2. Enter your custom domain
3. Add DNS records as instructed
4. Wait for DNS propagation

## Support

- GitHub Pages: https://docs.github.com/pages
- GitHub Actions: https://docs.github.com/actions
- Vite Deployment: https://vitejs.dev/guide/static-deploy.html
