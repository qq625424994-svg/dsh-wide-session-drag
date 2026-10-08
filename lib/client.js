/* DSH client bundle: hand-maintained window.__ModuleLoader__.load factory. */
if (typeof window !== 'undefined' && typeof window.__ModuleLoader__ !== 'undefined') {
  window.__ModuleLoader__.load({
    id: 'dsh-wide-session-drag',
    factory: (require, module, exports) => {
      module = module || { exports: {} }
      exports = module.exports

      const MIME = 'application/x-dsh-session-drag'
      const OVERLAY_ID = 'dsh-wide-session-drag-overlay'
      const TOAST_ID = 'dsh-wide-session-drag-toast'

      exports.name = 'dsh-wide-session-drag'
      exports.inject = []
      exports.apply = function apply(ctx) {
        const controller = createController(ctx)
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => {
            controller.start()
            return () => controller.stop()
          }, 'wide session drag capture')
        } else {
          controller.start()
        }
      }

      function createController(ctx) {
        let drag = null
        let overlay = null
        let toastEl = null
        let toastTimer = null
        let pending = null
        let pendingTimer = null
        let pendingTimeout = null

        function start() {
          document.addEventListener('dragstart', onDragStart, true)
          document.addEventListener('dragover', onDragOver, true)
          document.addEventListener('drop', onDrop, true)
          document.addEventListener('dragend', onDragEnd, true)
        }

        function stop() {
          document.removeEventListener('dragstart', onDragStart, true)
          document.removeEventListener('dragover', onDragOver, true)
          document.removeEventListener('drop', onDrop, true)
          document.removeEventListener('dragend', onDragEnd, true)
          hideOverlay()
          if (pendingTimer) clearInterval(pendingTimer)
          if (pendingTimeout) clearTimeout(pendingTimeout)
          pending = null
          pendingTimer = null
          pendingTimeout = null
        }

        function onDragStart(event) {
          if (event.defaultPrevented) return
          const selection = window.getSelection()
          if (selection && !selection.isCollapsed) return

          const row = findSessionRow(event.target)
          if (!row) return

          const data = extractSession(row)
          if (!data || !data.title) return

          drag = data
          try {
            event.dataTransfer.setData(MIME, JSON.stringify(data))
            event.dataTransfer.effectAllowed = 'copyMove'
          } catch (_) {
            /* Some platforms restrict dataTransfer; drag state still works. */
          }
        }

        function onDragOver(event) {
          if (!hasOurType(event) && !drag) return
          const boundary = getBoundary()
          if (event.clientX <= boundary) return

          event.preventDefault()
          event.stopPropagation()
          try {
            event.dataTransfer.dropEffect = 'copy'
          } catch (_) {}
          showOverlay(boundary)
        }

        function onDrop(event) {
          if (!hasOurType(event)) return
          const boundary = getBoundary()
          if (event.clientX <= boundary) return

          event.preventDefault()
          event.stopPropagation()
          hideOverlay()

          const data = drag || readDropData(event)
          drag = null
          if (!data) return

          Promise.resolve(data)
            .then(ensureId)
            .then(insertReference)
            .catch((error) => {
              console.warn('[dsh-wide-session-drag] drop failed:', error)
              toast('引用插入失败')
            })
        }

        function onDragEnd() {
          drag = null
          hideOverlay()
        }

        async function ensureId(data) {
          if (data.id) return data
          const id = await resolveSessionIdByTitle(data.title)
          return { ...data, id: id || '' }
        }

        function insertReference(data) {
          const text = data.id ? makeMention(data.id, data.title) : `@${data.title}`
          const composer = findComposer()

          if (!composer) {
            toast('未找到底部输入框')
            return
          }

          if (isLocked(composer)) {
            pending = { ...data, mentionText: text }
            toast('生成中暂无法插入引用，已暂存；生成结束后会自动填入')
            schedulePendingRetry()
            return
          }

          insertText(composer, text)
          if (!data.id) toast('未能识别会话 ID，已插入纯标题引用')
        }

        function schedulePendingRetry() {
          if (pendingTimer) return
          pendingTimer = setInterval(() => {
            if (!pending) {
              clearPending()
              return
            }
            const composer = findComposer()
            if (composer && !isLocked(composer)) {
              const data = pending
              clearPending()
              insertText(composer, data.mentionText || makeMention(data.id, data.title))
              toast('已自动填入暂存引用')
            }
          }, 500)

          pendingTimeout = setTimeout(() => {
            clearPending()
            toast('暂存引用超时未填入')
          }, 60000)
        }

        function clearPending() {
          if (pendingTimer) clearInterval(pendingTimer)
          if (pendingTimeout) clearTimeout(pendingTimeout)
          pending = null
          pendingTimer = null
          pendingTimeout = null
        }

        function hasOurType(event) {
          const types = event.dataTransfer && event.dataTransfer.types
          if (!types) return false
          return Array.from(types).includes(MIME)
        }

        function readDropData(event) {
          try {
            const raw = event.dataTransfer.getData(MIME)
            return raw ? JSON.parse(raw) : null
          } catch (_) {
            return null
          }
        }

        function findSessionRow(target) {
          let el = target && target.closest ? target : null
          while (el && el !== document.documentElement) {
            if (isSessionRow(el)) return el
            el = el.parentElement
          }
          return null
        }

        function isSessionRow(el) {
          if (!inSidebar(el)) return false
          if (el.draggable === true) return true
          if (el.dataset && (el.dataset.sessionId || el.dataset.session || el.dataset.conversationId)) return true
          const href = el.getAttribute('href')
          if (href && /(session|conversation|chat)/i.test(href)) return true
          return false
        }

        function inSidebar(el) {
          return Boolean(
            el.closest(
              'aside, nav, [class*="sidebar" i], [class*="side-bar" i], [data-testid*="sidebar" i], [aria-label*="sidebar" i]'
            )
          )
        }

        function extractSession(row) {
          const title = readTitle(row)
          if (!title) return null
          const id = readId(row)
          return {
            id,
            title,
            mentionText: id ? makeMention(id, title) : `@${title}`
          }
        }

        function readTitle(row) {
          const titled = row.querySelector('[data-title], [title], [class*="title" i], [aria-label]')
          if (titled) {
            const text =
              titled.dataset.title ||
              titled.getAttribute('title') ||
              titled.getAttribute('aria-label') ||
              titled.textContent
            if (text && text.trim()) return cleanTitle(text)
          }
          return cleanTitle(row.innerText || row.textContent)
        }

        function readId(row) {
          const ds = row.dataset || {}
          const direct = ds.sessionId || ds.session || ds.conversationId || ds.id
          if (direct) return direct

          const href = row.getAttribute('href')
          if (href) {
            const match = href.match(/(?:session|conversation|chat)[\/:=]([A-Za-z0-9_-]{8,})/i)
            if (match) return decodeURIComponent(match[1])
          }

          const child = row.querySelector('[data-session-id], [data-session], [data-conversation-id], [data-id]')
          if (child) {
            return (
              child.dataset.sessionId ||
              child.dataset.session ||
              child.dataset.conversationId ||
              child.dataset.id ||
              ''
            )
          }
          return ''
        }

        async function resolveSessionIdByTitle(title) {
          try {
            const sessions = (ctx.get && ctx.get('sessions')) || ctx.sessions
            if (!sessions || typeof sessions.list !== 'function') return ''
            const list = await Promise.resolve(sessions.list())
            if (!Array.isArray(list)) return ''
            const hit = list.find((item) => cleanTitle(item.title || item.name || '') === title)
            return (hit && (hit.id || hit.sessionId)) || ''
          } catch (_) {
            return ''
          }
        }

        function makeMention(id, title) {
          const safe = String(title || '')
            .replace(/\]/g, '\\]')
            .replace(/\n/g, ' ')
            .trim()
          return `@[${safe}](dsh-session:${id})`
        }

        function cleanTitle(text) {
          return String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160)
        }

        function getBoundary() {
          const resizer = document.querySelector(
            '[role="separator"], [class*="resizer" i], [class*="divider" i], [class*="splitter" i]'
          )
          if (isVisible(resizer)) {
            const rect = resizer.getBoundingClientRect()
            if (rect.left < window.innerWidth / 2) return rect.left
          }

          const sidebar = findSidebar()
          if (sidebar) return sidebar.getBoundingClientRect().right

          return Math.min(360, Math.floor(window.innerWidth * 0.25))
        }

        function findSidebar() {
          const candidates = Array.from(
            document.querySelectorAll(
              'aside, nav, [class*="sidebar" i], [class*="side-bar" i], [data-testid*="sidebar" i], [aria-label*="sidebar" i]'
            )
          )
          const visible = candidates
            .filter(isVisible)
            .filter((el) => {
              const rect = el.getBoundingClientRect()
              return rect.left < window.innerWidth / 3 && rect.width > 120
            })
            .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
          return visible[0] || null
        }

        function isVisible(el) {
          if (!el || !el.getBoundingClientRect) return false
          const rect = el.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
        }

        function findComposer() {
          const roots = Array.from(
            document.querySelectorAll(
              '[class*="composer" i], [class*="input-dock" i], [class*="editor" i], form, [role="application"]'
            )
          )

          let candidates = []
          for (const root of roots) {
            candidates = candidates.concat(
              Array.from(root.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
            )
          }

          if (!candidates.length) {
            candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
          }

          candidates = candidates
            .filter(isVisible)
            .filter((el) => el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
            .filter((el) => {
              const placeholder = el.getAttribute('placeholder') || ''
              return !/搜索|search|filter|筛选/i.test(placeholder)
            })

          candidates.sort((a, b) => area(b) - area(a))
          return candidates[0] || null
        }

        function area(el) {
          const rect = el.getBoundingClientRect()
          return rect.width * rect.height
        }

        function isLocked(el) {
          return (
            el.disabled ||
            el.readOnly ||
            el.getAttribute('aria-disabled') === 'true' ||
            (el.isContentEditable === false && el.getAttribute('contenteditable') !== 'true')
          )
        }

        function insertText(el, text) {
          el.focus()

          if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length
            const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length
            const next = el.value.slice(0, start) + text + el.value.slice(end)

            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
            const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set
            if (setter) setter.call(el, next)
            else el.value = next

            el.selectionStart = el.selectionEnd = start + text.length
            el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
          } else {
            const selection = window.getSelection()
            const range = document.createRange()
            range.selectNodeContents(el)
            range.collapse(false)
            selection.removeAllRanges()
            selection.addRange(range)

            let inserted = false
            try {
              inserted = document.execCommand('insertText', false, text)
            } catch (_) {}

            if (!inserted) {
              const node = document.createTextNode(text)
              range.insertNode(node)
              range.setStartAfter(node)
              range.collapse(true)
              selection.removeAllRanges()
              selection.addRange(range)
            }

            el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }))
          }

          el.focus()
        }

        function ensureOverlay() {
          if (overlay) return overlay
          overlay = document.createElement('div')
          overlay.id = OVERLAY_ID
          overlay.setAttribute('aria-hidden', 'true')
          Object.assign(overlay.style, {
            position: 'fixed',
            top: '0px',
            right: '0px',
            bottom: '0px',
            left: '0px',
            pointerEvents: 'none',
            zIndex: '2147483646',
            opacity: '0',
            transition: 'opacity 120ms ease',
            background: 'linear-gradient(90deg, rgba(59,130,246,0.06), rgba(59,130,246,0.16))',
            borderLeft: '2px solid rgba(59,130,246,0.75)',
            boxShadow: 'inset 0 0 120px rgba(59,130,246,0.10)'
          })
          document.body.appendChild(overlay)
          return overlay
        }

        function showOverlay(boundary) {
          const el = ensureOverlay()
          el.style.left = `${boundary}px`
          el.style.opacity = '1'
        }

        function hideOverlay() {
          if (overlay) overlay.style.opacity = '0'
        }

        function toast(message) {
          if (!toastEl) {
            toastEl = document.createElement('div')
            toastEl.id = TOAST_ID
            Object.assign(toastEl.style, {
              position: 'fixed',
              left: '50%',
              bottom: '96px',
              transform: 'translateX(-50%) translateY(8px)',
              zIndex: '2147483647',
              padding: '10px 16px',
              borderRadius: '10px',
              background: 'rgba(17,24,39,0.92)',
              color: '#fff',
              fontSize: '13px',
              lineHeight: '1.4',
              boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
              opacity: '0',
              transition: 'opacity 160ms ease, transform 160ms ease',
              pointerEvents: 'none',
              maxWidth: '80vw',
              textAlign: 'center'
            })
            document.body.appendChild(toastEl)
          }

          toastEl.textContent = message
          toastEl.style.opacity = '1'
          toastEl.style.transform = 'translateX(-50%) translateY(0)'
          clearTimeout(toastTimer)
          toastTimer = setTimeout(() => {
            if (toastEl) {
              toastEl.style.opacity = '0'
              toastEl.style.transform = 'translateX(-50%) translateY(8px)'
            }
          }, 2200)
        }

        return { start, stop }
      }

      return module.exports
    }
  })
}
