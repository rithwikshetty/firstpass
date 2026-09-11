# First Pass

First Pass helps job seekers see how AI résumé screeners may read a CV against a
specific job description.

Upload a PDF or DOCX résumé, paste a job listing, and the app runs two independent
model reviews side by side. It also provides a short consolidated action plan so
the user can decide what to improve first.

## Features

- Next.js App Router application
- PDF and DOCX text extraction
- One streaming request runs Claude and GPT reviews in parallel, then consolidates their advice
- Live stage updates while each model works
- Structured JSON responses with schema checks
- Small access gate for private deployments
- Request size, origin, and prompt budget checks

## Requirements

- Node.js 24.x
- npm 10+
- Anthropic and OpenAI API credentials

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Fill the values in `.env` before using the review flow.

Useful commands:

```bash
npm run lint
npm run test
npm run build
npm run release:check
```

`release:check` runs environment validation, linting, tests, dependency audit,
production build, and a release artifact scan.

## Deployment

The app deploys with Vercel's standard Next.js preset.

- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: leave unset
- Node runtime: `24.x`

Configure the same environment values from `.env.example` in your hosting
provider. Do not commit real `.env` files.

## Privacy

Uploaded files are parsed in memory by the server. The app does not persist CVs,
job descriptions, or review results. Review text is sent to the configured model
providers to generate responses.

## License

MIT
