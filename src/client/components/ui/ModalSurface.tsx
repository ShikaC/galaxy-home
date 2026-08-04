import type { ReactNode, RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

let bodyLockCount = 0
let previousBodyOverflow = ""

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
  bodyLockCount += 1
  return () => {
    bodyLockCount -= 1
    if (bodyLockCount === 0) document.body.style.overflow = previousBodyOverflow
  }
}

function focusableElements(surface: HTMLElement): readonly HTMLElement[] {
  return [...surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  )
}

function useModalFocus(surfaceRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const [returnFocus] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  useEffect(() => {
    const surface = surfaceRef.current
    if (surface === null) return
    const modalRoot = surface.closest<HTMLElement>("[data-modal-root]")
    const candidates = [
      ...document.body.children,
      ...document.querySelectorAll<HTMLElement>("[data-app-background]"),
    ]
    const backgrounds = candidates.filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== modalRoot && !element.contains(modalRoot),
    )
    const inertStates = backgrounds.map((element) => ({
      element,
      wasInert: element.hasAttribute("inert"),
    }))
    for (const { element } of inertStates) element.setAttribute("inert", "")
    const unlockBody = lockBodyScroll()

    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !surface.contains(active)) {
      const initial = surface.querySelector<HTMLElement>("[autofocus]")
      ;(initial ?? focusableElements(surface)[0] ?? surface).focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const focusable = focusableElements(surface)
      if (focusable.length === 0) {
        event.preventDefault()
        surface.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      const activeElement = document.activeElement
      if (event.shiftKey && (activeElement === first || !surface.contains(activeElement))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (activeElement === last || !surface.contains(activeElement))) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      for (const { element, wasInert } of inertStates) {
        if (!wasInert) element.removeAttribute("inert")
      }
      unlockBody()
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [onClose, returnFocus, surfaceRef])
}

type DialogSurfaceProps = {
  readonly ariaLabel?: string
  readonly ariaLabelledBy?: string
  readonly children: ReactNode
  readonly className?: string
  readonly onClose: () => void
}

export function DialogSurface({
  ariaLabel,
  ariaLabelledBy,
  children,
  className = "dialog",
  onClose,
}: DialogSurfaceProps) {
  const surfaceRef = useRef<HTMLElement>(null)
  useModalFocus(surfaceRef, onClose)
  return createPortal(
    <div className="overlay" data-modal-root>
      <section
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-modal="true"
        className={className}
        ref={surfaceRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  )
}

export function DrawerSurface({
  ariaLabel,
  children,
  onClose,
}: {
  readonly ariaLabel: string
  readonly children: ReactNode
  readonly onClose: () => void
}) {
  const surfaceRef = useRef<HTMLElement>(null)
  useModalFocus(surfaceRef, onClose)
  return createPortal(
    <aside
      aria-label={ariaLabel}
      aria-modal="true"
      className="ai-drawer"
      data-modal-root
      ref={surfaceRef}
      role="dialog"
      tabIndex={-1}
    >
      {children}
    </aside>,
    document.body,
  )
}
