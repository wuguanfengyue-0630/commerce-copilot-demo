const api = {
  state: "/api/v1/demo/state",
  reset: "/api/v1/demo/reset",
  suggest: "/api/v1/demo/suggestions",
};

const eventNames = {
  "conversation.message_ingested": "消费者消息已进入工作台",
  "knowledge.retrieved": "已检索已发布退款政策",
  "agent.suggestion_generated": "AI 建议已生成",
  "action.proposed": "退款提案已创建",
  "approval.approved": "主管已批准退款",
  "approval.rejected": "主管已拒绝退款",
  "action.execution_started": "模拟退款开始执行",
  "action.execution_succeeded": "模拟退款执行成功",
  "action.execution_blocked": "执行已阻断并转人工",
};

const capabilityNames = {
  "order.read": "订单读取",
  "logistics.read": "物流读取",
  "afterSale.read": "售后读取",
  "afterSale.write": "模拟售后写入",
  "message.receive": "飞鸽消息接收",
  "message.send": "飞鸽消息发送",
};

const statusNames = {
  available: "可用",
  waiting_qualification: "人工辅助",
  unavailable: "不可用",
  pending_approval: "待主管审批",
  approved: "已批准，待执行",
  executing: "执行中",
  executed: "模拟退款已执行",
};

let currentState = null;
let busy = false;

document.addEventListener("DOMContentLoaded", () => {
  wireNavigation();
  document.addEventListener("click", handleAction);
  void loadState();
});

async function loadState() {
  setBusy(true);
  clearFeedback();
  try {
    currentState = await request(api.state, "GET");
    render();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function handleAction(event) {
  const target = event.target.closest("[data-action]");
  if (!(target instanceof HTMLButtonElement) || busy) return;

  const action = target.dataset.action;
  if (action === "copy") {
    await copyReply();
    return;
  }
  if (action === "retry") {
    await loadState();
    return;
  }

  let url = null;
  let successMessage = "操作已完成。";
  if (action === "reset") {
    url = api.reset;
    successMessage = "演示已重置，可以重新体验完整流程。";
  } else if (action === "suggest") {
    url = api.suggest;
    successMessage = "有据建议和退款提案已生成。";
  } else if (action === "approve" && currentState?.proposal) {
    url = `/api/v1/demo/proposals/${encodeURIComponent(currentState.proposal.proposalId)}/approve`;
    successMessage = "主管已批准 ¥128.00 模拟退款。";
  } else if (action === "execute" && currentState?.proposal) {
    url = `/api/v1/demo/proposals/${encodeURIComponent(currentState.proposal.proposalId)}/execute`;
    successMessage = "模拟退款已执行，审计记录已更新。";
  }
  if (url === null) return;

  setBusy(true);
  clearFeedback();
  try {
    currentState = await request(url, "POST");
    render();
    showFeedback(successMessage, "success");
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function request(url, method) {
  const response = await fetch(url, { method, headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || `请求失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return body;
}

function render() {
  if (!currentState) return;
  document.getElementById("app").setAttribute("aria-busy", "false");
  renderCapabilities();
  renderConversation();
  renderSuggestion();
  renderContext();
  renderApproval();
  renderAudit();
  renderCounters();
}

function renderCapabilities() {
  const container = document.getElementById("capability-list");
  const rows = (currentState.capabilities || []).map((capability) => {
    const manual = capability.status !== "available";
    return element("div", "capability-row", [
      textElement("span", capabilityNames[capability.capability] || capability.capability),
      badge(manual ? "人工辅助" : "可用", manual ? "status-pending" : "status-approved"),
    ]);
  });
  container.replaceChildren(...rows);
}

function renderConversation() {
  const conversation = currentState.conversation;
  document.getElementById("conversation-count").textContent = "1 个会话";
  document.getElementById("thread-pane-title").textContent = "破损商品退款咨询";
  document.getElementById("workspace-status").textContent = workspaceStatus();

  const conversationItem = element("div", "conversation-item", [
    element("div", "conversation-title-line", [
      textElement("strong", "消费者 001"),
      badge("待处理", "status-pending"),
    ]),
    textElement(
      "p",
      conversation?.messages?.at(-1)?.content || "商品破损，申请退款",
      "conversation-preview",
    ),
    textElement("div", formatDate(conversation?.updatedAt), "meta-line"),
  ]);
  document.getElementById("conversation-list").replaceChildren(conversationItem);

  const messages = (conversation?.messages || []).map((message) =>
    element("article", `message-group ${message.role === "customer" ? "customer" : ""}`, [
      textElement("div", message.role === "customer" ? "消费者" : "客服", "message-label"),
      textElement("p", message.content || "", "message-bubble"),
      textElement("time", formatDate(message.occurredAt), "meta-line"),
    ]),
  );
  document.getElementById("message-thread").replaceChildren(...messages);
}

function renderSuggestion() {
  const container = document.getElementById("suggestion-content");
  const suggestion = currentState.suggestion;
  if (!suggestion) {
    container.replaceChildren(
      element("div", "empty-state", [
        textElement(
          "p",
          "基于实时订单和已发布政策生成回复，并同时创建待审批退款提案。",
          "empty-copy",
        ),
        actionButton("生成有据建议", "suggest", "button-primary"),
      ]),
    );
    return;
  }

  const editor = document.createElement("textarea");
  editor.id = "reply-editor";
  editor.className = "reply-editor";
  editor.value = suggestion.suggestedReply || "";
  editor.setAttribute("aria-label", "可编辑的 AI 建议回复");

  const citations = (suggestion.citations || []).map(citationDetails);
  container.replaceChildren(
    element("div", "suggestion-box", [
      element("div", "section-title-row", [
        badge("AI 建议", "status-approved"),
        textElement("span", "deterministic-demo", "meta-line"),
      ]),
      editor,
      element("div", "action-row", [
        textElement("p", "请复制到飞鸽并由人工发送，系统不会声称已发送。", "helper-text"),
        actionButton("复制回复", "copy", "button-secondary"),
      ]),
      ...citations,
    ]),
  );
}

function citationDetails(citation) {
  const details = document.createElement("details");
  details.className = "citation";
  const summary = document.createElement("summary");
  summary.textContent = `政策引用 · ${citation?.sourceTitle || "破损商品退款政策"} v${citation?.version || 1}`;
  const body = textElement(
    "p",
    citation?.excerpt || "商品破损可提交退款申请，须经主管审批。",
    "citation-body",
  );
  details.append(summary, body);
  return details;
}

function renderContext() {
  const order = currentState.order;
  const proposal = currentState.proposal;
  const sections = [
    contextSection("订单事实", [
      fact("订单号", order?.orderId || "order-delivered-12800"),
      fact("订单状态", orderStatus(order?.status)),
      fact("可退金额", money(order?.refundable)),
      fact("事实版本", `v${order?.version || 1}`),
    ]),
    contextSection("政策依据", [
      textElement("p", "破损商品可申请不超过可退金额的退款，必须经主管审批。", "helper-text"),
      badge("已发布 · v1", "status-approved"),
    ]),
    proposalSection(proposal),
  ];
  document.getElementById("context-content").replaceChildren(...sections);
}

function proposalSection(proposal) {
  if (!proposal) {
    return contextSection("退款提案", [
      textElement("p", "生成有据建议后，这里会出现 ¥128.00 待审批提案。", "empty-copy"),
    ]);
  }
  const children = [
    badge(statusNames[proposal.status] || proposal.status, statusClass(proposal.status)),
    fact("退款金额", money(proposal.payload?.amount)),
    fact("风险等级", "高 · 财务写操作"),
    fact("审批角色", "主管"),
  ];
  if (proposal.status === "pending_approval") {
    children.push(
      actionButton(`批准退款 ${money(proposal.payload?.amount)}`, "approve", "button-primary"),
    );
  } else if (proposal.status === "approved") {
    children.push(actionButton("执行模拟退款", "execute", "button-primary"));
  } else if (proposal.status === "executed") {
    children.push(
      textElement(
        "p",
        `外部参考号：${currentState.executionResult?.externalReference || "mock-refund"}`,
        "helper-text",
      ),
    );
  }
  return contextSection("退款提案", children);
}

function renderApproval() {
  const container = document.getElementById("approval-content");
  const proposal = currentState.proposal;
  if (!proposal) {
    container.replaceChildren(
      element("div", "empty-state", [
        textElement("h2", "暂无待审批提案"),
        textElement("p", "回到工作台生成有据建议后，退款影响会在这里集中展示。", "empty-copy"),
        viewButton("返回工作台", "workspace"),
      ]),
    );
    return;
  }

  const originalText = currentState.conversation?.messages?.[0]?.content || "商品破损，申请退款";
  const main = element("div", "approval-main", [
    badge(statusNames[proposal.status] || proposal.status, statusClass(proposal.status)),
    textElement("h2", "破损商品退款申请"),
    fact("消费者原话", originalText),
    fact("订单", proposal.payload?.orderId || ""),
    fact("政策引用", currentState.suggestion?.citations?.[0]?.sourceTitle || "破损商品退款政策 v1"),
    textElement("p", "系统只执行 Mock 退款，不会调用真实平台或真实资金接口。", "helper-text"),
  ]);
  const impactChildren = [
    textElement("span", "精准财务影响", "pane-kicker"),
    textElement("p", money(proposal.payload?.amount), "impact-amount"),
    fact("风险", "高"),
    fact("所需角色", "主管"),
  ];
  if (proposal.status === "pending_approval") {
    impactChildren.push(
      actionButton(`批准退款 ${money(proposal.payload?.amount)}`, "approve", "button-primary"),
    );
  } else if (proposal.status === "approved") {
    impactChildren.push(actionButton("执行模拟退款", "execute", "button-primary"));
  } else {
    impactChildren.push(
      textElement("p", "模拟退款已执行，可在审计页查看完整链路。", "helper-text"),
    );
    impactChildren.push(viewButton("查看审计", "audit"));
  }
  const impact = element("aside", "approval-impact", impactChildren);
  container.replaceChildren(element("div", "approval-layout", [main, impact]));
}

function renderAudit() {
  const events = currentState.auditEvents || [];
  const container = document.getElementById("audit-content");
  if (events.length === 0) {
    container.replaceChildren(textElement("p", "暂无审计事件。", "empty-copy"));
    return;
  }
  const timeline = element(
    "div",
    "audit-timeline",
    events.map((auditEvent) =>
      element("article", "audit-item", [
        textElement("time", formatDate(auditEvent.occurredAt), "audit-time"),
        element("div", "audit-copy", [
          textElement("h3", eventNames[auditEvent.eventType] || auditEvent.eventType),
          textElement("p", auditEvent.eventType, "meta-line"),
        ]),
      ]),
    ),
  );
  container.replaceChildren(timeline);
}

function renderCounters() {
  const pending = currentState.proposal?.status === "pending_approval" ? 1 : 0;
  const count = document.getElementById("approval-count");
  count.textContent = String(pending);
}

function wireNavigation() {
  document.querySelectorAll("[data-view]").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
  document.querySelectorAll("[data-mobile-panel]").forEach((tab) => {
    tab.addEventListener("click", () => switchMobilePane(tab.dataset.mobilePanel));
  });
}

function switchView(view) {
  if (!view) return;
  document.querySelectorAll("[data-view]").forEach((tab) => {
    const selected = tab.dataset.view === view;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
}

function switchMobilePane(pane) {
  if (!pane) return;
  document.getElementById("workspace-grid").dataset.mobilePane = pane;
  document.querySelectorAll("[data-mobile-panel]").forEach((tab) => {
    const selected = tab.dataset.mobilePanel === pane;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
}

function viewButton(label, view) {
  const button = actionButton(label, "view", "button-secondary");
  button.addEventListener("click", () => switchView(view));
  return button;
}

async function copyReply() {
  const editor = document.getElementById("reply-editor");
  if (!(editor instanceof HTMLTextAreaElement)) return;
  try {
    await navigator.clipboard.writeText(editor.value);
    showFeedback("回复已复制，请粘贴到飞鸽并由人工发送。", "success");
  } catch {
    editor.focus();
    editor.select();
    showFeedback("浏览器未允许自动复制，已选中文本，请按 Ctrl+C。", "error");
  }
}

function setBusy(value) {
  busy = value;
  document.getElementById("app")?.setAttribute("aria-busy", String(value));
  document.querySelectorAll("button[data-action]").forEach((button) => {
    button.disabled = value;
  });
}

function showError(error) {
  const message = error instanceof Error ? error.message : "操作未完成，请重试。";
  const retry = actionButton("重试", "retry", "button-secondary");
  const box = element("div", "feedback-message", [textElement("span", message), retry]);
  document.getElementById("global-feedback").replaceChildren(box);
}

function showFeedback(message, kind) {
  const box = textElement(
    "div",
    message,
    `feedback-message ${kind === "success" ? "success" : ""}`,
  );
  document.getElementById("global-feedback").replaceChildren(box);
}

function clearFeedback() {
  document.getElementById("global-feedback").replaceChildren();
}

function actionButton(label, action, className) {
  const button = textElement("button", label, `button ${className}`);
  button.type = "button";
  button.dataset.action = action;
  button.disabled = busy;
  return button;
}

function contextSection(title, children) {
  return element("section", "context-section", [textElement("h3", title), ...children]);
}

function fact(label, value) {
  return element("div", "fact-row", [
    textElement("span", label),
    textElement("span", value || "—", "fact-value"),
  ]);
}

function badge(label, modifier = "") {
  return textElement("span", label, `status-badge ${modifier}`.trim());
}

function element(tag, className, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function textElement(tag, text, className = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(text ?? "");
  return node;
}

function money(value) {
  const amount = Number.isSafeInteger(value?.amountMinor) ? value.amountMinor / 100 : 0;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: value?.currency || "CNY",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function orderStatus(status) {
  return (
    { paid: "已支付", shipped: "已发货", delivered: "已送达", refunded: "已退款" }[status] ||
    status ||
    "未知"
  );
}

function statusClass(status) {
  if (status === "executed") return "status-executed";
  if (status === "approved") return "status-approved";
  return "status-pending";
}

function workspaceStatus() {
  if (!currentState.suggestion) return "等待生成有据建议";
  if (currentState.proposal?.status === "pending_approval") return "退款提案等待主管审批";
  if (currentState.proposal?.status === "approved") return "已批准，等待执行模拟退款";
  if (currentState.proposal?.status === "executed") return "模拟退款已执行";
  return "人工处理";
}
