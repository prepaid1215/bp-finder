(function () {
  "use strict";

  const LABELS = {
    channel: { fax:"팩스", kakao:"카카오채널", both:"팩스·카카오채널", other:"기타", unknown:"확인 못함" },
    hours: { ontime:"정시 운영", late:"운영 시작 지연", irregular:"운영시간 변동", closed:"방문 시 휴무", unknown:"확인 못함" },
    stage: { prepared:"서류 작성만", submitted:"서류 전달", confirmed:"접수 확인", visited:"방문 완료" }
  };
  let selected = null;
  const layer = document.createElement("div");
  layer.id = "center-feedback-layer";
  layer.innerHTML = `
    <section id="center-feedback-panel" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle">
      <div class="feedback-top">
        <div>
          <h3 id="feedbackTitle">센터 접수 정보</h3>
          <p class="feedback-hint">센터별 이용자가 남긴 경험입니다. 공식 영업시간이나 접수 정책을 보증하지 않습니다. 방문·전송 전에 센터에 직접 확인하세요.</p>
        </div>
        <button type="button" class="feedback-close" id="feedbackClose">닫기</button>
      </div>
      <h4 class="feedback-list-label">이용 경험 남기기</h4>
      <p class="feedback-hint">실제로 확인한 내용만 작성하세요. 고객 이름·생년월일·전화번호·신청서 사진 등 개인정보를 적지 마세요. 등록하면 바로 공개됩니다. 개인정보가 포함되지 않았는지 확인해 주세요.</p>
      <form id="feedbackForm">
        <label for="feedbackChannel">신청서 접수 방식</label>
        <select id="feedbackChannel" required>
          <option value="unknown">확인하지 못함</option>
          <option value="fax">팩스로 받음</option>
          <option value="kakao">카카오톡 채널로 받음</option>
          <option value="both">둘 다 가능</option>
          <option value="other">직접 입력</option>
        </select>
        <input id="feedbackChannelDetail" type="text" maxlength="80" placeholder="접수 방식을 직접 입력해 주세요" style="display:none;margin-top:8px">
        <label for="feedbackHoursDetail">운영시간 (직접 입력)</label>
        <input id="feedbackHoursDetail" type="text" maxlength="200" placeholder="예: 평일 10시~18시, 방문 전 전화 확인 필요">
        <label for="feedbackVisitDate">확인한 날짜</label>
        <input id="feedbackVisitDate" type="date" required aria-label="확인 날짜 선택">
        <label for="feedbackNote">경험 내용 (5~400자)</label>
        <textarea id="feedbackNote" minlength="5" maxlength="400" required placeholder="예: 10시 20분에 통화 연결, 카카오톡으로 서류 전송 요청받음"></textarea>
        <input name="website" id="feedbackWebsite" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit" class="feedback-submit" id="feedbackSubmit">후기 제출</button>
        <p class="feedback-status" id="feedbackStatus" role="status" aria-live="polite"></p>
      </form>
      <h4 class="feedback-list-label">최근 등록된 경험</h4>
      <div id="feedbackList"><p class="feedback-empty">불러오는 중입니다.</p></div>
    </section>`;
  document.body.appendChild(layer);

  const byId = id => document.getElementById(id);
  const form = byId("feedbackForm");
  const feedbackStatus = byId("feedbackStatus");
  const list = byId("feedbackList");
  const closeButton = byId("feedbackClose");
  const submitButton = byId("feedbackSubmit");
  const lastFocus = { value: null };
  // Root-relative path prevents iframe URL or browser history from changing API routing.
  const API_URL = new URL("/api/center-comments", window.location.origin).href;
  async function parseApiResponse(response) {
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      const path = new URL(response.url || API_URL, window.location.href).pathname;
      throw new Error("서버가 JSON 대신 웹페이지를 반환했습니다. HTTP " + response.status + " · " + path + ". 새로고침 후 다시 시도해 주세요.");
    }
    if (!response.ok) throw new Error(data.error || ("후기 요청 실패 (HTTP " + response.status + ")"));
    return data;
  }
  const channelSelect = byId("feedbackChannel");
  const customChannel = byId("feedbackChannelDetail");
  function syncChannel() {
    const active = channelSelect.value === "other";
    customChannel.style.display = active ? "block" : "none";
    customChannel.required = active;
    if (!active) customChannel.value = "";
  }
  channelSelect.addEventListener("change", syncChannel);
  function resetDate() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
    const val = key => parts.find(p=>p.type===key)?.value;
    const today = val("year")+"-"+val("month")+"-"+val("day");
    byId("feedbackVisitDate").max = today;
    byId("feedbackVisitDate").value = today;
  }

  function notifyShell(open) {
    if (typeof notifyParentModal === "function") {
      notifyParentModal(open);
    } else if (window.parent !== window) {
      window.parent.postMessage({ type:"bp-finder:modal", open }, "*");
    }
  }
  function closeFeedback() {
    layer.classList.remove("open");
    document.body.style.overflow = byId("faxModal")?.classList.contains("open") ? "hidden" : "";
    notifyShell(Boolean(byId("faxModal")?.classList.contains("open")));
    lastFocus.value?.focus?.();
  }
  function itemText(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = String(text || "");
    return node;
  }
  // Turn displayed URLs into clickable links without interpreting user text as HTML.
  function noteWithLinks(value) {
    const paragraph = document.createElement("p");
    const note = String(value || "");
    const expression = /(?:https?:\/\/|www\.|pf\.kakao\.com\/)[^\s<>"']+/gi;
    let offset = 0;
    for (const match of note.matchAll(expression)) {
      const position = match.index;
      paragraph.appendChild(document.createTextNode(note.slice(offset, position)));
      const matched = match[0];
      const linkText = matched.replace(/[.,!?;:)\]}>，。！？、]+$/u, "");
      const suffix = matched.slice(linkText.length);
      try {
        const destination = /^https?:\/\//i.test(linkText) ? linkText : "https://" + linkText;
        const url = new URL(destination);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
          throw new Error("Unsupported link");
        }
        const anchor = document.createElement("a");
        anchor.href = url.href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.className = "feedback-note-link";
        anchor.textContent = linkText;
        paragraph.appendChild(anchor);
      } catch (error) {
        paragraph.appendChild(document.createTextNode(linkText));
      }
      paragraph.appendChild(document.createTextNode(suffix));
      offset = position + matched.length;
    }
    paragraph.appendChild(document.createTextNode(note.slice(offset)));
    return paragraph;
  }
  function renderEntries(rows) {
    list.replaceChildren();
    if (!rows.length) {
      list.appendChild(itemText("p","feedback-empty","공개된 이용 경험이 없습니다. 실제 이용 내용을 먼저 남길 수 있습니다."));
      return;
    }
    rows.forEach(row => {
      const card = document.createElement("article");
      card.className = "feedback-entry";
      const meta = [
        row.channel_detail || LABELS.channel[row.channel] || "접수 방식 미상",
        row.hours_detail || LABELS.hours[row.hours] || "운영시간 미상",
        row.visit_date || String(row.created_at || "").slice(0,10)
      ].filter(Boolean).join(" · ");
      card.appendChild(itemText("div","feedback-entry-meta",meta));
      card.appendChild(noteWithLinks(row.note));
      list.appendChild(card);
    });
  }
  async function loadComments() {
    list.replaceChildren(itemText("p","feedback-empty","최근 후기를 불러오는 중입니다."));
    try {
      const response = await fetch(API_URL + "?centerId=" + encodeURIComponent(selected.id), { cache:"no-store", credentials:"same-origin" });
      const payload = await parseApiResponse(response);
      renderEntries(Array.isArray(payload.comments) ? payload.comments : []);
    } catch (error) {
      list.replaceChildren(itemText("p","feedback-empty",error.message || "후기를 불러올 수 없습니다."));
    }
  }
  function openFor(center) {
    if (!center?.id) return;
    selected = { id:String(center.id), name:String(center.name || "") };
    lastFocus.value = document.activeElement;
    byId("feedbackTitle").textContent = selected.name + " · 접수 정보";
    form.reset();
    syncChannel();
    resetDate();
    feedbackStatus.textContent = "";
    layer.classList.add("open");
    document.body.style.overflow = "hidden";
    notifyShell(true);
    closeButton.focus();
    loadComments();
  }

  window.openCenterFeedback = function (rank) {
    openFor(window.currentList?.[rank] || (typeof currentList !== "undefined" ? currentList[rank] : null));
  };
  window.openCurrentCenterFeedback = function () {
    openFor(typeof currentBP !== "undefined" ? currentBP : null);
  };
  closeButton.addEventListener("click", closeFeedback);
  layer.addEventListener("click", event => {
    if (event.target === layer) closeFeedback();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && layer.classList.contains("open")) closeFeedback();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!selected || submitButton.disabled) return;
    submitButton.disabled = true;
    feedbackStatus.textContent = "등록 중입니다.";
    const payload = {
      centerId:selected.id,
      centerName:selected.name,
      channel:byId("feedbackChannel").value,
      channelDetail:customChannel.value.trim(),
      hoursDetail:byId("feedbackHoursDetail").value.trim(),
      visitDate:byId("feedbackVisitDate").value || null,
      note:byId("feedbackNote").value,
      website:byId("feedbackWebsite").value
    };
    try {
      const response = await fetch(API_URL, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        credentials:"same-origin",
        cache:"no-store",
        body:JSON.stringify(payload)
      });
      const result = await parseApiResponse(response);
      feedbackStatus.textContent = result.message || "등록 후 바로 공개됩니다.";
      form.reset();
      syncChannel();
      resetDate();
      // Refresh server results rather than rendering untrusted text as HTML.
      if (result.approved) await loadComments();
    } catch (error) {
      feedbackStatus.textContent = error.message || "등록에 실패했습니다.";
    } finally {
      submitButton.disabled = false;
    }
  });
})();
