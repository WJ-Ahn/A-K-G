/* =========================================================
   설정 — 여기 두 값만 본인 환경에 맞게 바꾸면 됩니다.
   ========================================================= */
const CLIENT_ID = '966666801240-6kao729ts6sicokuathc364vnult5agi.apps.googleusercontent.com'; // 구글 클라우드 콘솔에서 발급받은 클라이언트 ID
const FOLDER_NAME = 'Knowledge_Graph'; // 구글 드라이브 "내 드라이브"에 있는 폴더(또는 바로가기) 이름
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

/* =========================================================
   전역 상태
   ========================================================= */
let tokenClient = null;
let accessToken = null;
let currentProjectData = null; // { title, nodes, links, groups }
let nodeIndex = {};            // id -> node
let detailStack = [];          // 상세 화면 이동 히스토리 (뒤로가기용)

/* =========================================================
   초기화
   ========================================================= */
window.addEventListener('load', () => {
    initTheme();
    bindStaticEvents();

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error) {
                showLoginError('로그인에 실패했습니다: ' + resp.error);
                return;
            }
            accessToken = resp.access_token;
            enterProjectScreen();
        }
    });
});

function bindStaticEvents() {
    document.getElementById('login-btn').addEventListener('click', () => {
        showLoginError('');
        tokenClient.requestAccessToken({ prompt: 'consent' });
    });

    document.getElementById('theme-toggle-1').addEventListener('click', toggleTheme);

    document.getElementById('viewer-primary-action').innerHTML = ICON_ARROW_LEFT;
    document.getElementById('viewer-primary-action').addEventListener('click', goBackFromDetail);

    let searchDebounceTimer = null;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        const value = e.target.value;
        searchDebounceTimer = setTimeout(() => runSearch(value), 150);
    });

    // 햄버거 메뉴 (설정: 화면 모드 / 프로젝트 선택)
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const settingsMenu = document.getElementById('settings-menu');
    menuToggleBtn.innerHTML = ICON_HAMBURGER;

    menuToggleBtn.addEventListener('click', () => {
        const isOpen = settingsMenu.classList.toggle('open');
        menuToggleBtn.setAttribute('aria-expanded', isOpen);
    });

    document.addEventListener('click', (e) => {
        if (!settingsMenu.classList.contains('open')) return;
        if (settingsMenu.contains(e.target) || menuToggleBtn.contains(e.target)) return;
        settingsMenu.classList.remove('open');
        menuToggleBtn.setAttribute('aria-expanded', 'false');
    });

    document.getElementById('menu-project-select').addEventListener('click', () => {
        closeSettingsMenu();
        showScreen('project-screen');
    });

    document.getElementById('menu-theme-toggle').addEventListener('click', () => {
        toggleTheme();
        closeSettingsMenu();
    });

    // 엣지 스와이프로 뒤로가기 (상세 화면에서만 동작)
    const EDGE_ZONE = 24;   // 왼쪽 가장자리 감지 폭(px)
    const SWIPE_THRESHOLD = 80; // 뒤로가기로 인정할 최소 이동 거리(px)
    let touchStartX = null;
    let touchStartY = null;

    document.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (t.clientX <= EDGE_ZONE) {
            touchStartX = t.clientX;
            touchStartY = t.clientY;
        } else {
            touchStartX = null;
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (touchStartX === null) return;
        const t = e.changedTouches[0];
        const deltaX = t.clientX - touchStartX;
        const deltaY = Math.abs(t.clientY - touchStartY);

        const detailPanelActive = document.getElementById('detail-panel').classList.contains('active');
        if (detailPanelActive && deltaX > SWIPE_THRESHOLD && deltaY < 60) {
            goBackFromDetail();
        }
        touchStartX = null;
    }, { passive: true });
}

function showLoginError(msg) {
    document.getElementById('login-error').textContent = msg;
}

/* =========================================================
   화면 전환 헬퍼
   ========================================================= */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}
function showPanel(id) {
    document.querySelectorAll('.panel').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

/* =========================================================
   아이콘 (인라인 SVG)
   ========================================================= */
const ICON_ARROW_LEFT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>';
const ICON_HAMBURGER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>';

/* =========================================================
   뷰어 화면 하단 바 표시/숨김
   - 검색 결과 화면: 하단 바 숨김 (설정은 햄버거 메뉴로 이동)
   - 상세 화면: 화살표 아이콘(검색 결과로)만 표시
   ========================================================= */
function setViewerNav(mode) {
    const bar = document.getElementById('viewer-bottom-bar');
    bar.classList.toggle('active', mode === 'detail');
}

function closeSettingsMenu() {
    document.getElementById('settings-menu').classList.remove('open');
    document.getElementById('menu-toggle-btn').setAttribute('aria-expanded', 'false');
}

/* =========================================================
   테마 (다크/라이트) — 기존 PC 앱과 동일한 방식
   ========================================================= */
function initTheme() {
    const saved = localStorage.getItem('auge-viewer-theme');
    if (saved === 'light') document.body.classList.add('light-mode');
}
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('auge-viewer-theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}

/* =========================================================
   구글 드라이브 API 헬퍼
   ========================================================= */
async function driveFetch(url) {
    const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Drive API 오류 (${res.status}): ${body}`);
    }
    return res.json();
}

// "내 드라이브" 안에서 폴더(또는 그 폴더로의 바로가기)를 이름으로 찾아 실제 폴더 ID를 반환
async function resolveFolderId(folderName) {
    const q = encodeURIComponent(`name='${folderName.replace(/'/g, "\\'")}' and trashed=false`);
    const fields = encodeURIComponent('files(id,name,mimeType,shortcutDetails)');
    const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}`);

    if (!data.files || data.files.length === 0) {
        throw new Error(`'${folderName}' 폴더(또는 바로가기)를 드라이브에서 찾을 수 없습니다.`);
    }

    // 바로가기라면 원본 폴더 ID를, 폴더 자체라면 그 ID를 사용
    const shortcut = data.files.find(f => f.mimeType === 'application/vnd.google-apps.shortcut');
    if (shortcut && shortcut.shortcutDetails) {
        return shortcut.shortcutDetails.targetId;
    }
    const folder = data.files.find(f => f.mimeType === 'application/vnd.google-apps.folder');
    if (folder) return folder.id;

    throw new Error(`'${folderName}' 이름의 폴더를 찾지 못했습니다.`);
}

// 폴더 안의 JSON 프로젝트 파일 목록 (id, name, modifiedTime)
async function listProjectFiles(folderId) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (mimeType='application/json' or name contains '.json')`);
    const fields = encodeURIComponent('files(id,name,modifiedTime)');
    const data = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc`);
    return data.files || [];
}

// 파일 내용(JSON) 가져오기
async function fetchFileContent(fileId) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!res.ok) throw new Error('파일을 불러오지 못했습니다.');
    return res.json();
}

/* =========================================================
   프로젝트 선택 화면
   ========================================================= */
async function enterProjectScreen() {
    showScreen('project-screen');
    const listEl = document.getElementById('project-list');
    listEl.innerHTML = '<div class="loading-text">불러오는 중…</div>';

    try {
        const folderId = await resolveFolderId(FOLDER_NAME);
        const files = await listProjectFiles(folderId);

        if (files.length === 0) {
            listEl.innerHTML = '<div class="empty-hint">폴더 안에 프로젝트 파일이 없습니다.</div>';
            return;
        }

        // 각 파일의 title을 보여주기 위해 내용을 병렬로 가져옴 (구파일은 제목 없음 처리)
        const withMeta = await Promise.all(files.map(async (f) => {
            try {
                const content = await fetchFileContent(f.id);
                return { file: f, title: content.title || '제목 없음' };
            } catch (e) {
                return { file: f, title: '제목 없음' };
            }
        }));

        listEl.innerHTML = '';
        withMeta.forEach(({ file, title }) => {
            const card = document.createElement('div');
            card.className = 'project-card';
            const updated = new Date(file.modifiedTime).toLocaleDateString('ko-KR');
            card.innerHTML = `<div class="p-title"></div><div class="p-meta">수정일 ${updated}</div>`;
            card.querySelector('.p-title').textContent = title;
            card.addEventListener('click', () => openProject(file.id, title));
            listEl.appendChild(card);
        });
    } catch (err) {
        listEl.innerHTML = `<div class="error-text-block">${escapeHtml(err.message)}</div>`;
    }
}

/* =========================================================
   프로젝트 열기 → 뷰어 화면 진입
   ========================================================= */
async function openProject(fileId, title) {
    showScreen('viewer-screen');
    document.getElementById('search-input').value = '';
    showPanel('results-panel');
    setViewerNav('results');
    closeSettingsMenu();
    document.getElementById('results-list').innerHTML = '<div class="loading-text">불러오는 중…</div>';

    try {
        const data = await fetchFileContent(fileId);
        currentProjectData = data;
        nodeIndex = {};
        (data.nodes || []).forEach(n => { if (!n.isDeleted) nodeIndex[n.id] = n; });
        document.getElementById('results-list').innerHTML = '<div class="empty-hint">검색어를 입력해보세요</div>';
        detailStack = [];
    } catch (err) {
        document.getElementById('results-list').innerHTML = `<div class="error-text-block">${escapeHtml(err.message)}</div>`;
    }
}

/* =========================================================
   검색 (초성 검색 지원)
   ========================================================= */
const CHOSUNG_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function getChosung(str) {
    let result = '';
    for (const ch of str) {
        const code = ch.charCodeAt(0) - 0xAC00;
        if (code >= 0 && code <= 11171) {
            result += CHOSUNG_LIST[Math.floor(code / 588)];
        } else {
            result += ch;
        }
    }
    return result;
}

function isChosungOnly(str) {
    return /^[ㄱ-ㅎ]+$/.test(str);
}

function matchesText(target, query) {
    if (!target) return false;
    const lower = target.toLowerCase();
    const q = query.toLowerCase();
    if (lower.includes(q)) return true;
    if (isChosungOnly(query)) {
        return getChosung(target).includes(query);
    }
    return false;
}

function runSearch(rawQuery) {
    const query = rawQuery.trim();
    const listEl = document.getElementById('results-list');

    if (!query) {
        listEl.innerHTML = '<div class="empty-hint">검색어를 입력해보세요</div>';
        return;
    }

    const nodes = Object.values(nodeIndex);
    const nameMatches = nodes.filter(n => matchesText(n.id, query));
    const memoMatches = nodes.filter(n =>
        !nameMatches.includes(n) && matchesText(n.description || '', query)
    );

    if (nameMatches.length === 0 && memoMatches.length === 0) {
        listEl.innerHTML = '<div class="empty-hint">검색 결과가 없습니다</div>';
        return;
    }

    listEl.innerHTML = '';
    if (nameMatches.length > 0) {
        appendResultGroup(listEl, '노드', nameMatches, query);
    }
    if (memoMatches.length > 0) {
        appendResultGroup(listEl, '상세 메모', memoMatches, query);
    }
}

function appendResultGroup(container, label, items, query) {
    const groupLabel = document.createElement('div');
    groupLabel.className = 'result-group-label';
    groupLabel.textContent = label;
    container.appendChild(groupLabel);

    items.forEach(node => {
        const hasMemo = !!node.description;
        const item = document.createElement('div');
        item.className = 'result-item';
        let html = `<div class="r-name"></div>`;
        if (hasMemo) html += `<div class="r-snippet"></div>`;
        item.innerHTML = html;
        item.querySelector('.r-name').textContent = node.id;
        if (hasMemo) {
            item.querySelector('.r-snippet').textContent = buildSnippet(node.description, query);
        }
        item.addEventListener('click', () => {
            detailStack = [node.id];
            renderDetail(node.id);
        });
        container.appendChild(item);
    });
}

function buildSnippet(text, query) {
    if (!text) return '';
    const maxLen = 80; // 2줄 분량 기준 (CSS line-clamp:2와 함께 동작)
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) {
        // 검색어가 설명에 없는 경우 (이름만 매칭된 노드) → 앞부분부터 표시
        return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
    }
    const start = Math.max(0, idx - 20);
    const end = start + maxLen;
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/* =========================================================
   상세 화면
   ========================================================= */
function renderDetail(nodeId) {
    const node = nodeIndex[nodeId];
    if (!node) return;

    document.getElementById('detail-title').textContent = node.id;
    document.getElementById('detail-description').textContent = node.description || '(메모 없음)';

    const links = (currentProjectData.links || []).filter(l => !l.isDeleted);

    // 하위: 이 노드가 source인 링크 → target으로 뻗어나감
    const children = links.filter(l => getEndId(l.source) === nodeId);
    // 상위: 이 노드가 target인 링크 → source에서 들어옴
    const parents = links.filter(l => getEndId(l.target) === nodeId);

    renderRelList('detail-parents', parents.map(l => ({
        id: getEndId(l.source),
        relation: l.relation
    })));
    renderRelList('detail-children', children.map(l => ({
        id: getEndId(l.target),
        relation: l.relation
    })));

    showPanel('detail-panel');
    setViewerNav('detail');
    document.getElementById('detail-panel').scrollTop = 0;
}

function getEndId(end) {
    return typeof end === 'object' ? end.id : end;
}

// 상세 화면에서 "전 단계"로 이동: 연관 노드를 눌러 들어온 경우 이전 노드로, 아니면 검색 결과로
function goBackFromDetail() {
    detailStack.pop(); // 현재 보고 있는 노드 제거
    if (detailStack.length > 0) {
        const prevId = detailStack[detailStack.length - 1];
        renderDetail(prevId); // renderDetail 내부에서 setViewerNav('detail') 호출됨
    } else {
        showPanel('results-panel');
        setViewerNav('results');
    }
}

function renderRelList(containerId, items) {
    const el = document.getElementById(containerId);
    const validItems = items.filter(it => nodeIndex[it.id]);

    if (validItems.length === 0) {
        el.innerHTML = '<div class="rel-empty">없음</div>';
        return;
    }

    el.innerHTML = '';
    validItems.forEach(({ id, relation }) => {
        const item = document.createElement('div');
        item.className = 'rel-item';
        item.innerHTML = `<div class="rel-name"></div><div class="rel-label"></div>`;
        item.querySelector('.rel-name').textContent = id;
        item.querySelector('.rel-label').textContent = relation || '연결됨';
        item.addEventListener('click', () => {
            detailStack.push(id);
            renderDetail(id);
        });
        el.appendChild(item);
    });
}

/* =========================================================
   유틸
   ========================================================= */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
