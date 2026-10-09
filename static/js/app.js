const $ = id => document.getElementById(id);
const chat = $('chat'), thread = $('thread'), form = $('chatForm'), box = $('question'), sendBtn = $('sendBtn');
const traceEl = $('trace'), sourceUsed = $('sourceUsed'), tracePanel = $('tracePanel');

const SOURCES = {
    private_kb: { label: 'Company knowledge base', tone: 'kb' },
    web_search: { label: 'Web search', tone: 'web' },
    web: { label: 'Web search', tone: 'web' },
    direct: { label: 'Direct reply', tone: '' },
    insufficient_evidence: { label: 'No reliable source', tone: 'bad' },
};
const sourceOf = s => SOURCES[s] || { label: s || 'None yet', tone: '' };

const escapeHtml = (s = '') => s.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const fileName = p => (p || '').split(/[\\/]/).pop();

if (window.DOMPurify) {
    DOMPurify.addHook('afterSanitizeAttributes', n => {
        if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
    });
}
// Answers can contain web content, so markdown is always sanitized. Without the libraries, fall back to plain text.
const markdown = t => window.marked && window.DOMPurify
    ? DOMPurify.sanitize(marked.parse(t, { breaks: true }))
    : escapeHtml(t).replace(/\n/g, '<br>');

/* ---------- theme ---------- */

const root = document.documentElement;
try { const saved = localStorage.getItem('theme'); if (saved) root.dataset.theme = saved; } catch { }
$('themeToggle').onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { }
};

/* ---------- route panel ---------- */

function nodeFor(text, i) {
    const [label, ...rest] = text.split(' → ');
    const result = rest.join(' → ');
    const l = label.toLowerCase(), r = result.toUpperCase();
    let tone = '';
    if (/grade/.test(l)) tone = r === 'GOOD' ? 'good' : r === 'WEAK' ? 'weak' : '';
    else if (/stopped/.test(l)) tone = 'bad';
    else if (/web/.test(l)) tone = 'web';
    else if (/retriev/.test(l)) tone = 'kb';
    else if (/rewrite|answer|direct/.test(l)) tone = 'accent';
    const shown = /grade/.test(l) && tone
        ? `<span class="chip" data-tone="${tone === 'good' ? 'kb' : 'web'}">${escapeHtml(result.toLowerCase())}</span>`
        : escapeHtml(result);
    return `<li class="node" data-tone="${tone}" style="--i:${i}"><div class="node-label">${escapeHtml(label)}</div>${result ? `<div class="node-result">${shown}</div>` : ''}</li>`;
}

function renderTrace(items) {
    traceEl.innerHTML = items.map(nodeFor).join('');
}

function setSource(key) {
    const s = sourceOf(key);
    sourceUsed.textContent = s.label;
    sourceUsed.dataset.tone = s.tone;
}

/* ---------- messages ---------- */

function addUser(text) {
    const el = document.createElement('div');
    el.className = 'msg-user';
    el.textContent = text;
    thread.appendChild(el);
    scrollDown();
}

function addAssistant() {
    const el = document.createElement('article');
    el.className = 'msg-ai';
    el.innerHTML = '<div class="thinking" role="status" aria-label="Working on your answer"><i></i><i></i><i></i></div>';
    thread.appendChild(el);
    scrollDown();
    return el;
}

function fillAnswer(el, data, seconds) {
    const s = sourceOf(data.source_used);
    el.dataset.tone = s.tone;
    const cites = (data.citations || []).map(c => {
        const title = escapeHtml(c.url ? c.title : fileName(c.title));
        return c.url
            ? `<a class="chip" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
            : `<span class="chip">${title}</span>`;
    }).join('');
    el.innerHTML = `<div class="prose">${markdown(data.answer)}</div>
        <div class="msg-foot"><span class="chip" data-tone="${s.tone}">${escapeHtml(s.label)}</span>${cites}
        <span class="elapsed">${seconds}s</span><button class="link-btn" type="button">Copy</button></div>`;
    const copy = el.querySelector('.link-btn');
    copy.onclick = async () => {
        try { await navigator.clipboard.writeText(data.answer); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
        setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    };
}

function fillError(el, message, retry) {
    el.dataset.tone = 'bad';
    el.innerHTML = `<div class="prose"><p><strong>Couldn't get an answer.</strong> ${escapeHtml(message)}<button class="link-btn inline" type="button">Try again</button></p></div>`;
    el.querySelector('button').onclick = () => { el.remove(); ask(retry, false); };
}

function scrollDown() { chat.scrollTop = chat.scrollHeight; }

/* ---------- asking ---------- */

async function ask(q, echo = true) {
    $('empty')?.remove();
    if (echo) addUser(q);
    box.value = ''; autosize();
    sendBtn.disabled = true;
    traceEl.innerHTML = '<li class="node" data-pending data-tone="accent"><div class="node-label">Working on it</div></li>';
    setSource('');
    const reply = addAssistant();
    const t0 = performance.now();
    try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'The request failed.');
        fillAnswer(reply, data, ((performance.now() - t0) / 1000).toFixed(1));
        renderTrace(data.trace || []);
        setSource(data.source_used);
    } catch (e) {
        fillError(reply, e.message, q);
        traceEl.innerHTML = '<li class="route-empty">The request failed before a route was recorded.</li>';
        setSource('insufficient_evidence');
        sourceUsed.textContent = 'Error';
    } finally {
        sendBtn.disabled = false;
        box.focus();
        scrollDown();
    }
}

function autosize() { box.style.height = 'auto'; box.style.height = box.scrollHeight + 'px'; }
box.addEventListener('input', autosize);
box.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
});
form.addEventListener('submit', e => {
    e.preventDefault();
    const q = box.value.trim();
    if (q.length >= 2 && !sendBtn.disabled) ask(q);
});
document.querySelectorAll('.example').forEach(b => b.addEventListener('click', () => ask(b.textContent.trim())));

const emptyHtml = $('empty').outerHTML;
$('newChat').onclick = () => {
    thread.innerHTML = emptyHtml;
    thread.querySelectorAll('.example').forEach(b => b.addEventListener('click', () => ask(b.textContent.trim())));
    traceEl.innerHTML = '<li class="route-empty">Ask a question to see how the agent finds its answer.</li>';
    setSource('');
    box.focus();
};

/* ---------- route sheet (narrow screens) ---------- */

$('toggleTrace').onclick = e => {
    const open = tracePanel.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open);
};

/* ---------- upload dialog ---------- */

const modal = $('uploadModal'), fileInput = $('fileInput'), status = $('uploadStatus'), dropzone = $('dropzone');
const setStatus = (text, tone = '') => { status.textContent = text; status.dataset.tone = tone; };
$('openUpload').onclick = () => { setStatus(''); modal.showModal(); };
$('closeUpload').onclick = () => modal.close();
fileInput.onchange = () => { $('fileName').textContent = fileInput.files[0]?.name || 'Choose a file or drop it here'; };
['dragenter', 'dragover'].forEach(t => dropzone.addEventListener(t, e => { e.preventDefault(); dropzone.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => dropzone.addEventListener(t, () => dropzone.classList.remove('over')));
dropzone.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; fileInput.onchange(); }
});

$('uploadBtn').onclick = async () => {
    const file = fileInput.files[0];
    if (!file) { setStatus('Choose a file first.', 'bad'); return; }
    const btn = $('uploadBtn'); btn.disabled = true;
    setStatus('Adding the document. Large files can take a minute.');
    const fd = new FormData(); fd.append('file', file);
    try {
        const r = await fetch('/api/ingest', { method: 'POST', headers: { 'X-Admin-Key': $('adminKey').value }, body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || 'Upload failed.');
        setStatus(`Added ${d.file} as ${d.chunks} chunks.`, 'good');
    } catch (e) { setStatus(e.message, 'bad'); }
    finally { btn.disabled = false; }
};
