# branch

A tiny local proof-of-concept chat app that lets you branch conversations into a tree, then explore and continue each branch.

## Vibe code warning
This repo has been 100% vibe coded with Codex. Use at your own risk.

## Features
- Branching chat tree (each assistant response is a node)
- Auto branch naming (from the first prompt after branching)
- Manual branch rename + delete (with orphan node pruning)
- Lean tree view with clickable branch pills
- Streaming responses
- Local persistence (saved in your browser)
- Export/import chat trees as JSON

## Run it locally
```bash
python server.py
```

Then open:
```
http://localhost:8000
```

## How branching works
- Each assistant reply becomes a node.
- Clicking "Branch" clones the current conversation head into a new branch and switches to it.
- The branch name auto-updates from your first prompt in that branch.
- The left panel shows the tree and lets you switch branches with one click.

## Import/export
- Export: Click "Export JSON" in the left panel.
- Import: Click "Import JSON" and choose a previously exported file.

## Development
### Install dev tools
```bash
python -m pip install -r requirements-dev.txt
```

### Pre-commit hooks
```bash
pre-commit install
```

### Run checks
```bash
pre-commit run --all-files
```

### Run tests
```bash
pytest
```

## Notes
- This is a local prototype and stores chat state in your browser (localStorage).
- API keys stay on your machine. The app proxies requests through the local Python server.

## Roadmap ideas
- Auto branch summaries
- Model presets and system prompts
