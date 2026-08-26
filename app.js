// ---------- Rendering ----------
const ORIGINAL_CODE = {};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderBlock(block, exampleCounter) {
  switch (block.type) {
    case "text":
      return `<p class="body-text">${esc(block.text)}</p>`;
    case "sub":
      return `<h3 class="sub">${esc(block.text)}</h3>`;
    case "callout":
      return `<div class="callout">${esc(block.text)}</div>`;
    case "list":
      return `<ul class="plain">${block.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "syntax":
      return `<div class="example" style="background:var(--code-bg);border-color:var(--code-border);">
        <pre class="code-editor" style="border:none;background:none;padding:0;min-height:auto;resize:none;" tabindex="-1">${esc(block.lines.join("\n"))}</pre>
      </div>`;
    case "methodsTable":
      return `<div class="table-scroll"><table class="methods"><thead><tr>${block.headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
        block.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
      }</tbody></table></div>`;
    case "compareTable":
      return `<div class="table-scroll"><table class="compare"><thead><tr>${block.headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
        block.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
      }</tbody></table></div>`;
    case "quiz":
      return `<div class="quiz">${block.items.map(([q, a], i) => `
        <div class="quiz-row">
          <div class="quiz-q">${esc(q)}</div>
          <div class="quiz-a-wrap">
            <button class="quiz-reveal-btn" onclick="this.closest('.quiz-row').classList.add('revealed')">Reveal answer</button>
            <div class="quiz-answer">${esc(a)}</div>
          </div>
        </div>`).join("")}</div>`;
    case "tyList":
      return `<ol class="ty-list">${block.items.map(i => `<li>${esc(i)}</li>`).join("")}</ol>`;
    case "example": {
      const id = `ex-${exampleCounter.n++}`;
      const badge = block.num ? `<span class="example-badge">EXAMPLE ${esc(block.num)}</span>` : "";
      ORIGINAL_CODE[id] = block.code;
      const runBtn = block.noRun
        ? ""
        : `<button class="btn-run" data-target="${id}" onclick="runExample('${id}')">
             <span class="run-icon">&#9654;</span> Run
           </button>
           <button class="btn-reset" onclick="resetExample('${id}')">Reset code</button>`;
      return `<div class="example">
        <div class="example-head">
          <div class="example-title">${esc(block.title)}</div>
          ${badge}
        </div>
        <textarea class="code-editor" id="${id}-code" spellcheck="false">${esc(block.code)}</textarea>
        <div class="run-row">${runBtn}</div>
        <div class="output-panel${block.output ? " show static" : ""}" id="${id}-output" data-static="${block.output ? esc(block.output) : ""}">${block.output ? `<div class="output-label">Expected output (from textbook)</div>${esc(block.output)}` : ""}</div>
        ${block.explain ? `<div class="explain-text">${esc(block.explain)}</div>` : ""}
      </div>`;
    }
    default:
      return "";
  }
}

function renderSection(section, exampleCounter) {
  return `<section id="${section.id}">
    <div class="section-kicker">${esc(section.kicker)}</div>
    <h2 class="section-title">${esc(section.title)}</h2>
    <p class="lede">${esc(section.lede)}</p>
    ${section.blocks.map(b => renderBlock(b, exampleCounter)).join("\n")}
  </section>`;
}

function renderAll() {
  const counter = { n: 1 };
  const main = document.getElementById("main-content");
  main.innerHTML = CH5_DATA.sections.map(s => renderSection(s, counter)).join("\n");
  autoSizeAllCodeEditors();
}

function autoSizeCodeEditor(el) {
  el.style.height = "auto";
  el.style.height = (el.scrollHeight + 2) + "px";
}

function autoSizeAllCodeEditors() {
  document.querySelectorAll("textarea.code-editor").forEach(autoSizeCodeEditor);
}

// Grow as the student types/edits, and re-check once web fonts finish loading
// (font metrics can change scrollHeight after the initial render).
document.addEventListener("input", (e) => {
  if (e.target.matches("textarea.code-editor")) autoSizeCodeEditor(e.target);
});
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(autoSizeAllCodeEditors);
}

// ---------- Pyodide runner ----------
let pyodideLoadPromise = null;

async function getPyodideInstance() {
  if (!pyodideLoadPromise) {
    pyodideLoadPromise = (async () => {
      const py = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
      return py;
    })().catch(err => {
      // Reset so a later click can retry instead of being stuck with a permanently-rejected promise.
      pyodideLoadPromise = null;
      throw err;
    });
  }
  return pyodideLoadPromise;
}

function resetExample(id) {
  const codeEl = document.getElementById(`${id}-code`);
  const outEl = document.getElementById(`${id}-output`);
  if (codeEl) { codeEl.value = ORIGINAL_CODE[id]; autoSizeCodeEditor(codeEl); }
  if (outEl) {
    const staticOut = outEl.dataset.static;
    outEl.classList.remove("err");
    if (staticOut) {
      outEl.classList.add("show", "static");
      outEl.innerHTML = `<div class="output-label">Expected output (from textbook)</div>${esc(staticOut)}`;
    } else {
      outEl.classList.remove("show", "static");
      outEl.textContent = "";
    }
  }
}

async function runExample(id) {
  const codeEl = document.getElementById(`${id}-code`);
  const outEl = document.getElementById(`${id}-output`);
  const btn = document.querySelector(`.btn-run[data-target="${id}"]`);
  const code = codeEl.value;

  outEl.classList.remove("err", "static");
  outEl.classList.add("show");
  outEl.textContent = "Loading Python runtime... (first run only, ~10s)";
  btn.disabled = true;
  const originalBtnHTML = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> Running`;

  // 20s timeout so a stalled CDN fetch fails fast with a clear message instead of hanging forever.
  const withTimeout = (p, ms) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timed out loading the Python runtime. Check your connection and try again.")), ms)),
  ]);

  try {
    const pyodide = await withTimeout(getPyodideInstance(), 20000);

    let captured = "";
    pyodide.setStdout({ batched: (msg) => { captured += msg + "\n"; } });
    pyodide.setStderr({ batched: (msg) => { captured += msg + "\n"; } });
    pyodide.setStdin({
      stdin: () => {
        const v = window.prompt("This program is asking for input:");
        return v === null ? "" : v;
      },
    });

    // Fresh globals per run so examples don't leak variables into each other.
    const ns = pyodide.globals.get("dict")();
    try {
      await pyodide.runPythonAsync(code, { globals: ns });
    } finally {
      ns.destroy();
    }

    outEl.innerHTML = `<div class="output-label">Live output</div>${esc(captured || "(no output)")}`;
    outEl.classList.remove("err");
  } catch (err) {
    outEl.classList.add("err");
    outEl.classList.remove("static");
    outEl.innerHTML = `<div class="output-label" style="color:var(--danger)">Error</div>${esc((err && err.message) ? err.message : String(err))}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalBtnHTML;
  }
}

document.addEventListener("DOMContentLoaded", renderAll);
