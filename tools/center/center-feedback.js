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
      <p class="feedback-hint">실제로 확인한 내용만 작성하세요. 고객 이름·생년월일·전화번호·신청서 사진 등 개인정보를 적지 마세요. 등록내용은 관리자 검수 후 공개됩니다.</p>
      <form id="feedbackForm">
        <label for="feedbackChannel">신청서 접수 방식</label>
        <select id="feedbackChannel" required>
          <option value="unknown">확인하지 못함</option>
          <option value="fax">팩스로 받음</option>
          <option value="kakao">카카오톡 채널로 받음</option>
          <option value="both">둘 다 가능</option>
          <option value="other">다른 방식</option>
        </select>
        <label for="feedbackHours">운영시간 경험</label>
        <select id="feedbackHours" required>
          <option value="unknown">확인하지 못함</option>
          <option value="ontime">안내된 시간에 정상 운영</option>
          <option value="late">안내된 시작시간보다 늦음</option>
          <option value="irregular">운영시간이 일정하지 않음</option>
          <option value="closed">안내된 시간에 방문했지만 휴무</option>
        </select>
        <label for="feedbackStage">진행 단계</label>
        <select id="feedbackStage" required>
          <option value="prepared">서류 작성만 완료</option>
          <option value="submitted">신청서 전달</option>
          <option value="confirmed">센터 접수 확인</option>
          <option value="visited">센터 방문 완료</option>
        </select>
        <label for="feedbackVisitDate">확인한 날짜 (선택)</label>
        <input id="feedbackVisitDate" type="date">
        <label for="feedbackNote">경험 내용 (5~400자)</label>
        <textarea id="feedbackNote" minlength="5" maxlength="400" required placeholder="예: 10시 20분에 통화 연결, 카카오톡으로 서류 전송 요청받음"></textarea>
        <input name="website" id="feedbackWebsite" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit" class="feedback-submit" id="feedbackSubmit">후기 제출</button>
        <p class="feedback-status" id="feedbackStatus" role="status" aria-live="polite"></p>
      </form>
      <h4 class="feedback-list-label">최근 공개된 경험</h4>
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
        LABELS.channel[row.channel] || "접수 방식 미상",
        LABELS.hours[row.hours] || "운영시간 미상",
        LABELS.stage[row.stage] || "진행 단계 미상",
        row.visit_date || String(row.created_at || "").slice(0,10)
      ].filter(Boolean).join(" · ");
      card.appendChild(itemText("div","feedback-entry-meta",meta));
      card.appendChild(itemText("p","",row.note));
      list.appendChild(card);
    });
  }
  async function loadComments() {
    list.replaceChildren(itemText("p","feedback-empty","최근 후기를 불러오는 중입니다."));
    try {
      const response = await fetch(`https://jvatfvqudcyrocykvpot.supabase.co/functions/v1/center-feedback?centerId=${encodeURIComponent(selected.id)}`, { cache:"no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "불러오기에 실패했습니다.");
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
      channel:byId("feedbackChannel").value,
      hours:byId("feedbackHours").value,
      stage:byId("feedbackStage").value,
      visitDate:byId("feedbackVisitDate").value || null,
      note:byId("feedbackNote").value,
      website:byId("feedbackWebsite").value
    };
    try {
      const response = await fetch("https://jvatfvqudcyrocykvpot.supabase.co/functions/v1/center-feedback", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "제출 실패");
      feedbackStatus.textContent = result.message || "관리자 확인 후 공개됩니다.";
      form.reset();
      // Pending entries are intentionally not inserted into public comments.
    } catch (error) {
      feedbackStatus.textContent = error.message || "등록에 실패했습니다.";
    } finally {
      submitButton.disabled = false;
    }
  });
})();
