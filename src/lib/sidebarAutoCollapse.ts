/**
 * Recolhimento automático da barra lateral (regra da barra da clínica, agora compartilhada):
 *  - recolhe sozinha ~5 s depois que aparece expandida, SÓ enquanto o usuário não interagiu;
 *  - o mouse em cima pausa a contagem e ao sair ela recomeça;
 *  - qualquer clique manual (expandir/recolher) desliga o recolhimento automático pelo resto da sessão;
 *  - não roda no mobile (lá a barra é uma gaveta que o usuário abre/fecha) nem quando já está recolhida.
 *
 * Lógica pura, com relógio injetável, para poder ser testada sem React nem timers reais.
 */

export const SIDEBAR_AUTO_COLLAPSE_MS = 5000;

export interface AutoCollapseScheduler {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface AutoCollapseController {
  /** Chamar quando `enabled`/`isCollapsed` mudam: (re)inicia a contagem se as condições valerem. */
  sync: (state: { enabled: boolean; isCollapsed: boolean }) => void;
  mouseEnter: () => void;
  mouseLeave: () => void;
  /** Ação manual do usuário: cancela e desliga o automático. */
  manualToggle: (nextCollapsed: boolean) => void;
  dispose: () => void;
  readonly hasUserInteracted: boolean;
}

export function createAutoCollapseController(options: {
  onCollapse: () => void;
  onManualToggle?: (nextCollapsed: boolean) => void;
  delayMs?: number;
  scheduler?: AutoCollapseScheduler;
}): AutoCollapseController {
  const delay = options.delayMs ?? SIDEBAR_AUTO_COLLAPSE_MS;
  const scheduler: AutoCollapseScheduler = options.scheduler ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };

  let handle: unknown = null;
  let interacted = false;
  let enabled = true;
  let collapsed = false;

  const cancel = () => {
    if (handle !== null) {
      scheduler.clearTimeout(handle);
      handle = null;
    }
  };
  const canRun = () => enabled && !collapsed && !interacted;
  const start = () => {
    cancel();
    if (!canRun()) return;
    handle = scheduler.setTimeout(() => {
      handle = null;
      if (canRun()) options.onCollapse();
    }, delay);
  };

  return {
    sync(state) {
      enabled = state.enabled;
      collapsed = state.isCollapsed;
      if (canRun()) start();
      else cancel();
    },
    mouseEnter() {
      if (!interacted) cancel();
    },
    mouseLeave() {
      if (canRun()) start();
    },
    manualToggle(nextCollapsed) {
      interacted = true;
      cancel();
      options.onManualToggle?.(nextCollapsed);
    },
    dispose: cancel,
    get hasUserInteracted() {
      return interacted;
    },
  };
}
