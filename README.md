# branch

A tiny local proof-of-concept chat app that lets you branch conversations into a tree, then explore and continue each branch.

## Features
- Branching chat tree (each assistant response is a node)
- Manual branch naming + rename
- Lean tree view with clickable branch pills
- Streaming responses
- Local persistence (saved in your browser)

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
- The left panel shows the tree and lets you switch branches with one click.

## Notes
- This is a local prototype and stores chat state in your browser (localStorage).
- API keys stay on your machine. The app proxies requests through the local Python server.

## Roadmap ideas
- Export/import trees
- Auto branch naming
- Model presets and system prompts
