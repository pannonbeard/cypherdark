Hooks.once("init", () => {

  // ── Extend the Cypher System's PC sheet ─────────────────────────────────
  // We grab whatever sheet class the system registered for PCs and extend it
  // so we inherit all its save/submit/item-drag logic for free
  const baseClass = Object.values(CONFIG.Actor.sheetClasses?.pc ?? {})
    .find(s => s.id.startsWith("cypher"))?.cls;

  if (!baseClass) {
    console.error("CypherDark | Could not find the Cypher System PC sheet class. Is the system active?");
    return;
  }

  class CypherDarkSheet extends baseClass {

    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["cypherdark"],
        template: "modules/cypherdark/templates/pc-sheet.hbs",
        width: 780,
        height: 660,
        tabs: [{
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "stats"
        }],
        resizable: true,
      });
    }

    // Pass extra computed values to the template
    async getData() {
      const context = await super.getData();
      context.cypherCount = (context.items ?? []).filter(i => i.type === "cypher").length;
      return context;
    }

    // Wire up click interactions that can't be done with plain form inputs
    activateListeners(html) {
      super.activateListeners(html);

      if (!this.isEditable) return;

      // XP pip clicks
      html.find(".xp-pip").click(ev => {
        const pip = parseInt(ev.currentTarget.dataset.pip);
        const current = this.actor.system.basic.xp ?? 0;
        // clicking a filled pip removes XP down to that index
        // clicking an empty pip sets XP to pip + 1
        const newXp = pip < current ? pip : pip + 1;
        this.actor.update({ "system.basic.xp": newXp });
      });

      // Status badge toggles (Impaired / Debilitated / Dead)
      html.find(".status-badge").click(ev => {
        const status = ev.currentTarget.dataset.status;
        const current = foundry.utils.getProperty(this.actor, `system.damage.${status}`) ?? false;
        this.actor.update({ [`system.damage.${status}`]: !current });
      });
    }
  }

  // Register as the default sheet for PC actors — replaces the system sheet
  Actors.registerSheet("cypherdark", CypherDarkSheet, {
    types: ["pc"],
    makeDefault: true,
    label: "Cypher Dark (OGoA)"
  });

  // Unregister the system's own PC sheet so ours is the only option
  // Comment this out if you'd rather let players choose between the two
  Actors.unregisterSheet("cyphersystem", baseClass, { types: ["pc"] });

});