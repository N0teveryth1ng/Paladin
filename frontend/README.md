# Paladin

Paladin is a small system design canvas. Describe a system to draw a first
version, then move, connect, rename, or add boxes directly on the canvas.

## Start it

You need Node.js 24, the repository's `backend/.venv`, and a configured free
model in `eval/freeze.json` with provider credentials in the ignored `.env`.

In one terminal, start the local API:

```powershell
cd backend
.venv\Scripts\python.exe -m app.api
```

In another terminal, start the canvas:

```powershell
cd frontend
npm run dev
```

Open <http://127.0.0.1:5173>.

## Use the canvas

- Describe a system in the bottom prompt and press **Draw**. A successful
  generation replaces the canvas; a failed run leaves the current design.
- Drag boxes to arrange them. Drag a small handle from one box to another to
  connect them.
- Select a box or connection to edit its details in the small inspector.
- Use **Add box**, **Fit canvas**, or **New** from the top bar. **New** clears
  the current design.

Designs are held in memory and reset when the page reloads. The canvas and API
run locally; generation sends the prompt to the configured model provider.

## Development

```powershell
npm ci
npm run build
```

`src/layout/layout.ts` provides the automatic first layout for generated and
added components. After that, canvas positions are user-controlled.
