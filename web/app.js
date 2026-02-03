const STORAGE_KEY = "branch_v0_1_state";

const state = {
  nodes: {},
  branches: [],
  currentBranchId: null,
  isSending: false,
  pendingAssistant: null,
  pendingUser: null,
};

const elements = {
  tree: document.getElementById("tree"),
  chat: document.getElementById("chat"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  userInput: document.getElementById("userInput"),
  sendBtn: document.getElementById("sendBtn"),
  branchBtn: document.getElementById("branchBtn"),
  renameBtn: document.getElementById("renameBtn"),
  status: document.getElementById("status"),
  currentBranch: document.getElementById("currentBranch"),
};

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
    const mainBranch = createBranch("Main", "root");
    setCurrentBranch(mainBranch.id, false);
  }
  renderAll();

  elements.sendBtn.addEventListener("click", sendMessage);
  elements.branchBtn.addEventListener("click", createBranchFromCurrent);
  elements.renameBtn.addEventListener("click", renameCurrentBranch);
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
    state.branches = parsed.branches || [];
    state.currentBranchId = parsed.currentBranchId || null;
  } catch (err) {
    console.warn("Failed to load saved state", err);
  }
}

function saveState() {
  const data = {
    nodes: state.nodes,
    branches: state.branches,
    currentBranchId: state.currentBranchId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function createBranch(name, headId) {
  const branch = {
    id: crypto.randomUUID(),
    name: name.trim(),
    headId,
    createdAt: Date.now(),
  };
  state.branches.push(branch);
  saveState();
  return branch;
}

function createBranchFromCurrent() {
  const current = getCurrentBranch();
  if (!current) return;

  const name = prompt("Name your new branch:");
  if (!name || !name.trim()) return;

  const newBranch = createBranch(name, current.headId);
  setCurrentBranch(newBranch.id);
}

function renameCurrentBranch() {
  const current = getCurrentBranch();
  if (!current) return;

  const name = prompt("Rename current branch:", current.name);
  if (!name || !name.trim()) return;

  current.name = name.trim();
  saveState();
  renderAll();
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

function buildChildrenMap() {
  const map = {};
  Object.values(state.nodes).forEach((node) => {
    if (!node.parentId) return;
    if (!map[node.parentId]) map[node.parentId] = [];
    map[node.parentId].push(node.id);
  });
  Object.values(map).forEach((children) => {
    children.sort((a, b) => state.nodes[a].createdAt - state.nodes[b].createdAt);
  });
  return map;
}

function buildTreeLines() {
  const lines = [];
  const childrenMap = buildChildrenMap();

  lines.push({
    prefix: "",
    text: "\u25cf",
    nodeId: "root",
  });

  const rootChildren = childrenMap.root || [];
  rootChildren.forEach((childId, index) => {
    const isLast = index === rootChildren.length - 1;
    addNodeLine(childId, "", isLast, childrenMap, lines);
  });

  return lines;
}

function addNodeLine(nodeId, prefix, isLast, childrenMap, lines) {
  const connector = isLast ? "\u2514\u2500 " : "\u251c\u2500 ";
  lines.push({
    prefix: `${prefix}${connector}`,
    text: "\u25cf",
    nodeId,
  });

  const childPrefix = `${prefix}${isLast ? "   " : "\u2502  "}`;
  const children = childrenMap[nodeId] || [];
  children.forEach((childId, index) => {
    const childLast = index === children.length - 1;
    addNodeLine(childId, childPrefix, childLast, childrenMap, lines);
  });
}

function renderTree() {
  elements.tree.innerHTML = "";
  const lines = buildTreeLines();

  const branchesByNode = state.branches.reduce((acc, branch) => {
    acc[branch.headId] = acc[branch.headId] || [];
    acc[branch.headId].push(branch);
    return acc;
  }, {});

  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = "tree-row";

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = `${line.prefix}${line.text}`;
    row.appendChild(label);

    const branches = branchesByNode[line.nodeId] || [];
    branches.forEach((branch) => {
      const button = document.createElement("button");
      button.className = "tree-branch";
      if (branch.id === state.currentBranchId) {
        button.classList.add("current");
      }
      button.textContent = branch.name;
      button.addEventListener("click", () => {
        setCurrentBranch(branch.id);
      });
      row.appendChild(button);
    });

    elements.tree.appendChild(row);
  });
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
    assistantBubble.textContent = node.assistantText;
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
    pending.textContent = state.pendingAssistant;
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
  elements.currentBranch.textContent = `Current branch: ${current.name}`;
}

function renderAll() {
  renderTree();
  renderChat();
  renderStatus();
  renderCurrentBranch();
}

async function sendMessage() {
  if (state.isSending) return;

  const apiKey = elements.apiKey.value.trim();
  const model = elements.model.value.trim();
  const userText = elements.userInput.value.trim();
  const current = getCurrentBranch();

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

  state.isSending = true;
  state.pendingUser = userText;
  state.pendingAssistant = "";
  elements.userInput.value = "";
  renderAll();

  const messages = buildMessagesForBranch(current);
  messages.push({ role: "user", content: userText });

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

    current.headId = nodeId;
    saveState();
  } catch (err) {
    alert(err.message || "Something went wrong");
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

init();
