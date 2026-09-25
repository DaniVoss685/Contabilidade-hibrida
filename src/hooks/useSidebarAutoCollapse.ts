import { useEffect, useMemo, useRef } from 'react';
import { createAutoCollapseController } from '../lib/sidebarAutoCollapse';

/**
 * Recolhimento automático (~5 s) da barra lateral — a mesma regra da barra da clínica
 * (`src/lib/sidebarAutoCollapse.ts`). Devolve os handlers para o `<aside>` e para o botão de alternar.
 */
export function useSidebarAutoCollapse(args: {
  /** false no mobile (gaveta) — o automático só vale para a barra fixa do desktop. */
  enabled: boolean;
  isCollapsed: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}) {
  const { enabled, isCollapsed, onToggleCollapse } = args;

  // O controlador guarda "o usuário já mexeu?" pela vida do componente; sempre chama o callback mais recente.
  const toggleRef = useRef(onToggleCollapse);
  toggleRef.current = onToggleCollapse;

  const controller = useMemo(
    () =>
      createAutoCollapseController({
        onCollapse: () => toggleRef.current?.(true),
        onManualToggle: (next) => toggleRef.current?.(next),
      }),
    []
  );

  const hasToggle = Boolean(onToggleCollapse);
  useEffect(() => {
    controller.sync({ enabled: enabled && hasToggle, isCollapsed });
  }, [controller, enabled, hasToggle, isCollapsed]);

  useEffect(() => () => controller.dispose(), [controller]);

  return {
    handleManualToggle: controller.manualToggle,
    handleMouseEnter: controller.mouseEnter,
    handleMouseLeave: controller.mouseLeave,
  };
}
