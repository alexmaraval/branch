const STORAGE_KEY = "branch_v0_1_state";

const state = {
  nodes: {},
  branches: [],
  currentBranchId: null,
  isSending: false,
  pendingAssistant: null,
  pendingUser: null,
  collapsed: new Set(),
};

const elements = {
  tree: document.getElementById("tree"),
  chat: document.getElementById("chat"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  userInput: document.getElementById("userInput"),
  sendBtn: document.getElementById("sendBtn"),
  branchBtn: document.getElementById("branchBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  status: document.getElementById("status"),
  currentBranch: document.getElementById("currentBranch"),
};

function renderMarkdown(text) {
  if (!window.marked) {
    return text;
  }
  return window.marked.parse(text || "", {
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false,
  });
}

function init() {
  loadState();
  if (!state.currentBranchId) {
    state.nodes.root = {
      id: "root",
      parentId: null,
      userText: null,
      assistantText: null,
      createdAt: Date.now(),
    };
    const mainBranch = createBranch("Main", "root", false);
    setCurrentBranch(mainBranch.id, false);
  }
  renderAll();

  elements.sendBtn.addEventListener("click", sendMessage);
  elements.branchBtn.addEventListener("click", createBranchFromCurrent);
  elements.deleteBtn.addEventListener("click", deleteCurrentBranch);
  elements.exportBtn.addEventListener("click", exportTree);
  elements.importBtn.addEventListener("click", () =>
    elements.importFile.click(),
  );
  elements.importFile.addEventListener("change", importTree);

  elements.userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    state.nodes = parsed.nodes || {};
    state.branches = (parsed.branches || []).map((branch) => ({
      ...branch,
      parentBranchId: branch.parentBranchId || null,
      autoNamePending:
        typeof branch.autoNamePending === "boolean"
          ? branch.autoNamePending
          : isPlaceholderBranchName(branch.name),
    }));
    inferBranchParents();
    state.currentBranchId = parsed.currentBranchId || null;
    state.collapsed = new Set(parsed.collapsed || []);
  } catch (err) {
    console.warn("Failed to load saved state", err);
  }
}

function saveState() {
  const data = {
    nodes: state.nodes,
    branches: state.branches,
    currentBranchId: state.currentBranchId,
    collapsed: Array.from(state.collapsed),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function createBranch(
  name,
  headId,
  autoNamePending = false,
  parentBranchId = null,
) {
  if (!parentBranchId) {
    const current = getCurrentBranch();
    if (current) parentBranchId = current.id;
  }
  const branch = {
    id: crypto.randomUUID(),
    name: name.trim(),
    headId,
    createdAt: Date.now(),
    autoNamePending,
    locked: false,
    parentBranchId,
  };
  state.branches.push(branch);
  saveState();
  return branch;
}

function createBranchFromCurrent() {
  const current = getCurrentBranch();
  if (!current) return;

  const nextIndex = state.branches.length + 1;
  const newBranch = createBranch(
    `Branch ${nextIndex}`,
    current.headId,
    true,
    current.id,
  );
  current.locked = true;
  saveState();
  setCurrentBranch(newBranch.id);
}

function renameBranch(branch) {
  if (!branch) return;
  const name = prompt("Rename branch:", branch.name);
  if (!name || !name.trim()) return;
  branch.name = name.trim();
  branch.autoNamePending = false;
  saveState();
  renderAll();
}

function deleteCurrentBranch() {
  const current = getCurrentBranch();
  if (!current) return;

  const confirmed = confirm(`Delete branch "${current.name}"?`);
  if (!confirmed) return;

  state.branches = state.branches.filter((branch) => branch.id !== current.id);

  if (state.branches.length === 0) {
    const mainBranch = createBranch("Main", "root", false);
    setCurrentBranch(mainBranch.id);
  } else {
    setCurrentBranch(state.branches[0].id);
  }

  pruneOrphanNodes();
  saveState();
  renderAll();
}

function createContinuationBranch(baseBranch) {
  const baseName = baseBranch.name.replace(/\s0\.\d+$/, "");
  const siblings = state.branches.filter((branch) =>
    branch.name.startsWith(`${baseName} 0.`),
  );
  const nextIndex = siblings.length + 1;
  const created = createBranch(
    `${baseName} 0.${nextIndex}`,
    baseBranch.headId,
    false,
    baseBranch.id,
  );
  return created;
}

function pruneOrphanNodes() {
  const keep = new Set(["root"]);
  for (const branch of state.branches) {
    let cursor = branch.headId;
    while (cursor && cursor !== "root") {
      if (keep.has(cursor)) break;
      keep.add(cursor);
      const node = state.nodes[cursor];
      if (!node) break;
      cursor = node.parentId;
    }
  }

  Object.keys(state.nodes).forEach((nodeId) => {
    if (!keep.has(nodeId)) {
      delete state.nodes[nodeId];
    }
  });
}

function setCurrentBranch(branchId, persist = true) {
  state.currentBranchId = branchId;
  if (persist) saveState();
  renderAll();
}

function getCurrentBranch() {
  return state.branches.find((branch) => branch.id === state.currentBranchId);
}

function buildPathToNode(nodeId) {
  const path = [];
  let cursor = nodeId;
  while (cursor && cursor !== "root") {
    const node = state.nodes[cursor];
    if (!node) break;
    path.push(node);
    cursor = node.parentId;
  }
  return path.reverse();
}

function buildMessagesForBranch(branch) {
  const path = buildPathToNode(branch.headId);
  const messages = [];
  for (const node of path) {
    messages.push({ role: "user", content: node.userText });
    messages.push({ role: "assistant", content: node.assistantText });
  }
  return messages;
}

function buildBranchLines() {
  const lines = [];
  const byParent = {};
  state.branches.forEach((branch) => {
    const key = branch.parentBranchId || "root";
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(branch);
  });
  Object.values(byParent).forEach((children) => {
    children.sort((a, b) => a.createdAt - b.createdAt);
  });

  lines.push({
    prefix: "",
    text: "\u25cf",
    isRoot: true,
    hasChildren: (byParent.root || []).length > 0,
    collapsed: false,
  });

  const roots = byParent.root || [];
  roots.forEach((branch, index) => {
    const isLast = index === roots.length - 1;
    addBranchLine(branch, "", isLast, byParent, lines);
  });

  return lines;
}

function addBranchLine(branch, prefix, isLast, byParent, lines) {
  const connector = isLast ? "\u2514\u2500 " : "\u251c\u2500 ";
  const children = byParent[branch.id] || [];
  const collapsed = state.collapsed.has(branch.id);
  const hasChildren = children.length > 0;
  lines.push({
    prefix: `${prefix}${connector}`,
    text: hasChildren ? (collapsed ? "\u25b8" : "\u25be") : "\u25cf",
    branch,
    hasChildren,
    collapsed,
  });

  const childPrefix = `${prefix}${isLast ? "   " : "\u2502  "}`;
  if (!collapsed) {
    children.forEach((child, index) => {
      const childLast = index === children.length - 1;
      addBranchLine(child, childPrefix, childLast, byParent, lines);
    });
  }
}

function renderTree() {
  elements.tree.innerHTML = "";
  const lines = buildBranchLines();
  const current = getCurrentBranch();
  const activeBranches = new Set();
  let cursor = current;
  while (cursor) {
    activeBranches.add(cursor.id);
    cursor = state.branches.find((b) => b.id === cursor.parentBranchId);
  }

  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = "tree-row";

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = line.prefix;
    const dot = document.createElement("span");
    dot.className = "tree-dot";
    if (line.branch && activeBranches.has(line.branch.id)) {
      dot.classList.add("active");
    }
    dot.textContent = line.text;
    if (line.hasChildren && line.branch) {
      dot.classList.add("collapsible");
      dot.title = line.collapsed ? "Expand branch" : "Collapse branch";
      dot.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleCollapse(line.branch.id);
      });
    } else if (line.isRoot) {
      dot.title = "root";
    } else if (line.branch) {
      dot.title = line.branch.name;
    }
    label.appendChild(dot);
    row.appendChild(label);

    if (line.branch) {
      const branch = line.branch;
      const wrap = document.createElement("div");
      wrap.className = "tree-branch-wrap";

      const button = document.createElement("button");
      button.className = "tree-branch";
      if (branch.id === state.currentBranchId) {
        button.classList.add("current");
      }
      button.textContent = branch.name;
      button.addEventListener("click", () => {
        setCurrentBranch(branch.id);
      });

      const editBtn = document.createElement("button");
      editBtn.className = "tree-branch-edit";
      editBtn.setAttribute("aria-label", `Rename ${branch.name}`);
      editBtn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" class="edit-icon">
          <path
            d="M4 17.5V20h2.5l10-10-2.5-2.5-10 10zm13.1-11.6 1.9 1.9a1 1 0 0 0 1.4 0l1-1a1 1 0 0 0 0-1.4l-1.9-1.9a1 1 0 0 0-1.4 0l-1 1a1 1 0 0 0 0 1.4z"
            fill="currentColor"
          />
        </svg>
      `;
      editBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        renameBranch(branch);
      });

      wrap.appendChild(button);
      wrap.appendChild(editBtn);
      row.appendChild(wrap);
    }

    elements.tree.appendChild(row);
  });
}

function inferBranchParents() {
  if (!state.branches.length) return;
  // Determine root as earliest created branch (usually Main)
  const sortedByTime = [...state.branches].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const rootBranchId = sortedByTime[0].id;

  // Index branches by headId for quick lookup
  const branchesByHead = {};
  state.branches.forEach((b) => {
    if (!branchesByHead[b.headId]) branchesByHead[b.headId] = [];
    branchesByHead[b.headId].push(b);
  });
  Object.values(branchesByHead).forEach((list) =>
    list.sort((a, b) => a.createdAt - b.createdAt),
  );

  state.branches.forEach((branch) => {
    if (branch.parentBranchId || branch.id === rootBranchId) return;

    const candidates = (branchesByHead[branch.headId] || []).filter(
      (b) => b.id !== branch.id && b.createdAt <= branch.createdAt,
    );
    const parent =
      candidates.length > 0 ? candidates[candidates.length - 1] : null;

    branch.parentBranchId = parent ? parent.id : rootBranchId;
  });
}

function toggleCollapse(branchId) {
  if (state.collapsed.has(branchId)) {
    state.collapsed.delete(branchId);
  } else {
    state.collapsed.add(branchId);
  }
  saveState();
  renderTree();
}

function renderChat() {
  elements.chat.innerHTML = "";
  const current = getCurrentBranch();
  if (!current) return;

  const path = buildPathToNode(current.headId);
  path.forEach((node) => {
    const userBubble = document.createElement("div");
    userBubble.className = "message user";
    userBubble.textContent = node.userText;
    elements.chat.appendChild(userBubble);

    const assistantBubble = document.createElement("div");
    assistantBubble.className = "message assistant";
    assistantBubble.innerHTML = renderMarkdown(node.assistantText);
    elements.chat.appendChild(assistantBubble);
  });

  if (state.pendingUser) {
    const pendingUser = document.createElement("div");
    pendingUser.className = "message user pending";
    pendingUser.textContent = state.pendingUser;
    elements.chat.appendChild(pendingUser);
  }

  if (state.pendingAssistant) {
    const pending = document.createElement("div");
    pending.className = "message assistant pending";
    pending.innerHTML = renderMarkdown(state.pendingAssistant);
    elements.chat.appendChild(pending);
  }

  elements.chat.scrollTop = elements.chat.scrollHeight;
}

function renderStatus() {
  if (state.isSending) {
    elements.status.textContent = "Thinking...";
  } else {
    elements.status.textContent = "";
  }
}

function renderCurrentBranch() {
  const current = getCurrentBranch();
  if (!current) return;
  const depth = getBranchDepth(current);
  elements.currentBranch.innerHTML = `
    <span class="branch-pill">
      <svg viewBox="0 0 16 16" aria-hidden="true" class="branch-icon">
        <path
          fill-rule="evenodd"
          d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"
          fill="currentColor"
        />
      </svg>
      <span>${current.name}</span>
      <span class="branch-depth">depth-${depth}</span>
    </span>
  `;
}

function getBranchDepth(branch) {
  let depth = 0;
  const seen = new Set();
  let cursor = branch;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    cursor = state.branches.find((b) => b.id === cursor.parentBranchId);
    if (cursor) depth += 1;
  }
  return depth;
}

function renderAll() {
  renderTree();
  renderChat();
  renderStatus();
  renderCurrentBranch();
}

function autoNameBranchFromPrompt(branch, userText, force = false) {
  if (!branch.autoNamePending && !force) return;
  const trimmed = userText.replace(/\s+/g, " ").trim();
  if (!trimmed) return;
  branch.name = trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed;
  branch.autoNamePending = false;
}

async function generateBranchName({ apiKey, model, userText, assistantText }) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You create short branch names. Return a 2-4 word title in Title Case. Respond with only the name.",
        },
        {
          role: "user",
          content: `User message:\n${userText}\n\nAssistant reply:\n${assistantText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Name generation failed");
  }

  const data = await response.json();
  return String(data.assistant || "").trim();
}

async function sendMessage() {
  if (state.isSending) return;

  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim();
  const userText = elements.userInput.value.trim();
  let current = getCurrentBranch();

  if (!apiKey) {
    alert("Please enter your API key.");
    return;
  }
  if (!model) {
    alert("Please enter a model name.");
    return;
  }
  if (!userText) {
    return;
  }
  if (!current) {
    alert("No branch selected.");
    return;
  }

  if (current.locked) {
    const continuation = createContinuationBranch(current);
    current = continuation;
    setCurrentBranch(current.id);
  }

  state.isSending = true;
  state.pendingUser = userText;
  state.pendingAssistant = "";
  elements.userInput.value = "";
  renderAll();

  const messages = buildMessagesForBranch(current);
  messages.push({ role: "user", content: userText });

  const shouldAutoName =
    current.autoNamePending || isPlaceholderBranchName(current.name);

  try {
    const assistantText = await streamChat({ apiKey, model, messages });

    const nodeId = crypto.randomUUID();
    state.nodes[nodeId] = {
      id: nodeId,
      parentId: current.headId,
      userText,
      assistantText: assistantText || "(empty response)",
      createdAt: Date.now(),
    };

    if (shouldAutoName) {
      try {
        const generated = await generateBranchName({
          apiKey,
          model,
          userText,
          assistantText,
        });
        if (generated) {
          current.name = generated;
        } else {
          autoNameBranchFromPrompt(current, userText, true);
        }
      } catch (err) {
        console.warn("Failed to auto-name branch", err);
        autoNameBranchFromPrompt(current, userText, true);
      } finally {
        current.autoNamePending = false;
      }
    }
    current.headId = nodeId;
    saveState();
  } catch (err) {
    alert(normalizeSendError(err));
  } finally {
    state.isSending = false;
    state.pendingAssistant = null;
    state.pendingUser = null;
    renderAll();
  }
}

async function streamChat(payload) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok && !contentType.includes("text/event-stream")) {
    const data = await response.json();
    throw new Error(data.error || "Request failed");
  }

  if (!contentType.includes("text/event-stream")) {
    const data = await response.json();
    return data.assistant;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();

    for (const part of parts) {
      const lines = part.split("\n");
      let eventType = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.replace("event:", "").trim();
        } else if (line.startsWith("data:")) {
          dataLine = line.replace("data:", "").trim();
        }
      }

      if (eventType === "error") {
        try {
          const errPayload = JSON.parse(dataLine);
          throw new Error(errPayload.error || "Stream error");
        } catch (err) {
          throw new Error("Stream error");
        }
      }

      if (dataLine === "[DONE]") {
        return assistantText;
      }

      if (dataLine) {
        try {
          const payload = JSON.parse(dataLine);
          if (payload.delta) {
            assistantText += payload.delta;
            state.pendingAssistant = assistantText;
            renderChat();
            renderStatus();
          }
        } catch (err) {
          console.warn("Bad stream chunk", err);
        }
      }
    }
  }

  return assistantText;
}

function normalizeSendError(err) {
  if (!err) return "Something went wrong";
  const message = String(err.message || err);
  if (message === "Load failed" || message === "Failed to fetch") {
    return "Network error: could not reach /api/chat. Is the server running?";
  }
  return message;
}

function isPlaceholderBranchName(name) {
  return /^Branch\s+\d+$/.test(name || "");
}

function exportTree() {
  const data = {
    nodes: state.nodes,
    branches: state.branches,
    currentBranchId: state.currentBranchId,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `branch-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importTree(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid JSON file");
      }

      state.nodes = parsed.nodes || {};
      state.branches = parsed.branches || [];
      state.currentBranchId = parsed.currentBranchId || null;

      if (!state.nodes.root) {
        state.nodes.root = {
          id: "root",
          parentId: null,
          userText: null,
          assistantText: null,
          createdAt: Date.now(),
        };
      }

      if (!state.currentBranchId && state.branches.length > 0) {
        state.currentBranchId = state.branches[0].id;
      }

      if (state.branches.length === 0) {
        const mainBranch = createBranch("Main", "root", false);
        state.currentBranchId = mainBranch.id;
      }

      pruneOrphanNodes();
      saveState();
      renderAll();
    } catch (err) {
      alert(err.message || "Failed to import");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

init();
