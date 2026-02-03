const state = {
  nodes: {
    root: {
      id: "root",
      parentId: null,
      userText: null,
      assistantText: null,
      createdAt: Date.now(),
    },
  },
  branches: [],
  currentBranchId: null,
  isSending: false,
  pendingAssistant: null,
};

const elements = {
  tree: document.getElementById("tree"),
  chat: document.getElementById("chat"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  userInput: document.getElementById("userInput"),
  sendBtn: document.getElementById("sendBtn"),
  branchBtn: document.getElementById("branchBtn"),
  status: document.getElementById("status"),
  currentBranch: document.getElementById("currentBranch"),
};

function init() {
  const mainBranch = createBranch("Main", "root");
  state.currentBranchId = mainBranch.id;
  renderAll();

  elements.sendBtn.addEventListener("click", sendMessage);
  elements.branchBtn.addEventListener("click", createBranchFromCurrent);
  elements.userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

function createBranch(name, headId) {
  const branch = {
    id: crypto.randomUUID(),
    name: name.trim(),
    headId,
    createdAt: Date.now(),
  };
  state.branches.push(branch);
  return branch;
}

function createBranchFromCurrent() {
  const current = getCurrentBranch();
  if (!current) return;

  const name = prompt("Name your new branch:");
  if (!name || !name.trim()) return;

  const newBranch = createBranch(name, current.headId);
  state.currentBranchId = newBranch.id;
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

function snippet(text) {
  if (!text) return "(empty)";
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 28 ? `${trimmed.slice(0, 28)}...` : trimmed;
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
    text: "root",
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
  const node = state.nodes[nodeId];
  const label = node ? `assistant: ${snippet(node.assistantText)}` : "assistant";
  lines.push({
    prefix: `${prefix}${connector}`,
    text: label,
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
        state.currentBranchId = branch.id;
        renderAll();
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
  state.pendingAssistant = "Thinking...";
  elements.userInput.value = "";
  renderAll();

  const messages = buildMessagesForBranch(current);
  messages.push({ role: "user", content: userText });

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, model, messages }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    const nodeId = crypto.randomUUID();
    state.nodes[nodeId] = {
      id: nodeId,
      parentId: current.headId,
      userText,
      assistantText: data.assistant || "(empty response)",
      createdAt: Date.now(),
    };

    current.headId = nodeId;
  } catch (err) {
    alert(err.message || "Something went wrong");
  } finally {
    state.isSending = false;
    state.pendingAssistant = null;
    renderAll();
  }
}

init();
