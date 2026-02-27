Hooks.once("init", () => {
  Handlebars.registerHelper("times", function(n, options) {
    let result = "";
    for (let i = 0; i < n; i++) {
      result += options.fn({ ...options.hash, index: i });
    }
    return result;
  });

  Handlebars.registerHelper("sub", function(a, b) {
    return a - b;
  });

  Handlebars.registerHelper("lte", function(a, b) {
    return a <= b;
  });

  Handlebars.registerHelper("gt", function(a, b) {
    return a > b;
  });

  Handlebars.registerHelper("gte", function(a, b) {
    return a >= b;
  });

  Handlebars.registerHelper("eq", function(a, b) {
    return a === b;
  });

  Handlebars.registerHelper("neq", function(a, b) {
    return a !== b;
  });

  Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context, null, 2); // null, 2 for pretty printing
  });
})

Hooks.once("setup", async () => {
  // Load and register partials
  const partialNames = [
    "header",
    "tab-stats",
    "tab-skills",
    "tab-abilities",
    "tab-cyphers",
    "tab-equipment",
    "tab-notes",
    "item-skill",
    "item-ability",
    "item-cypher",
    "item-equipment",
    "item-attack",
    "item-generic",
  ];

  for (const name of partialNames) {
    const path = `modules/cypherdark/templates/partials/${name}.hbs`;
    const text = await fetch(path).then(r => r.text());
    Handlebars.registerPartial(`cypherdark-${name}`, text);
  }
});


Hooks.once("ready", () => {

  // ── Find base sheet class ──────────────────────────────────────────────
  const baseClass = Object.values(CONFIG.Actor.sheetClasses?.pc ?? {})
    .find(s => s.id.startsWith("cypher"))?.cls;

  if (!baseClass) {
    console.error("CypherDark | Could not find the Cypher System PC sheet class.");
    return;
  }

  // ── Sheet class ────────────────────────────────────────────────────────
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

    async getData() {
      const context = await super.getData();
      context.cypherCount = (context.items ?? []).filter(i => i.type === "cypher").length;
      // Pass damage track states so the template can render them as buttons
      context.damageStates = ["Hale", "Impaired", "Debilitated", "Dead"];
      // Type choices for the select dropdown
      context.typeChoices = {
        "Protector": "Protector",
        "Sage": "Sage",
        "Explorer": "Explorer",
        "Speaker": "Speaker"
      };
      
      return context;
    }

    activateListeners(html) {
      super.activateListeners(html);
      // if (!this.isEditable) return;

      // XP pip clicks
      html.find(".xp-pip").click(ev => {
        const pip = parseInt(ev.currentTarget.dataset.pip);
        const current = this.actor.system.basic.xp ?? 0;
        const newXp = pip < current ? pip : pip + 1;
        this.actor.update({ "system.basic.xp": newXp });
      });

      // Damage track state buttons
      // Clicking the active state resets to Hale; clicking another sets it
      html.find(".status-badge").click(ev => {
        const state = ev.currentTarget.dataset.state;
        const current = this.actor.system.combat.damageTrack.state;
        const newState = current === state ? "Hale" : state;
        this.actor.update({ "system.combat.damageTrack.state": newState });
      });

      html.find("input, select, textarea").on("change", ev => {
        const el = ev.currentTarget;
        const field = el.name;
        console.log('loading field')
        if (!field) return; // skip elements with no name attribute

        console.log('loading value')
        let value;
        if (el.type === "checkbox") {
          value = el.checked;
        } else if (el.type === "number") {
          value = el.value === "" ? null : Number(el.value);
        } else {
          value = el.value;
        }
        console.log(`${field}: ${value}`)
        console.log(this.actor)

        this.actor.update({ [field]: value });
      });

      // ── Skill: Add ─────────────────────────────────────────────────────────
      html.find(".btn-add-skill").click(async () => {
        const input = html.find("#new-skill-name");
        const name = input.val().trim();
        if (!name) return;

        await this.actor.createEmbeddedDocuments("Item", [{
          name,
          type: "skill",
          system: { skillLevel: "Trained" }
        }]);

        input.val("");
      });

      // Allow pressing Enter in the input to add the skill
      html.find("#new-skill-name").keydown(async ev => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        html.find(".btn-add-skill").trigger("click");
      });

      // ── Skill: Cycle level ─────────────────────────────────────────────────
      // Skill: Cycle — Practiced → Trained → Specialized → Practiced
      html.find(".skill-cycle").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;
        const levels = ["Practiced", "Trained", "Specialized"];
        const current = item.system.basic.rating ?? "Practiced";
        const next = levels[(levels.indexOf(current) + 1) % levels.length];
        await item.update({ "system.basic.rating": next });
      });

      // Skill: Toggle inability
      html.find(".skill-inability").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;
        const isInability = item.system.basic.rating === "Inability";
        await item.update({ "system.basic.rating": isInability ? "Practiced" : "Inability" });
      });

      // ── Skill: Delete ──────────────────────────────────────────────────────
      html.find(".item-delete").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        console.log(this.actor.items)
        const item = this.actor.items.get(id);
        if (!item) return;

        // Show a confirmation dialog before deleting
        const confirmed = await Dialog.confirm({
          title: "Delete Skill",
          content: `<p>Delete <strong>${item.name}</strong>? This cannot be undone.</p>`,
        });

        if (confirmed) await item.delete();
      });

      // ── Ability: Add ───────────────────────────────────────────────────────
      html.find(".btn-add-ability").click(async () => {
        const name    = html.find("#new-ability-name").val().trim();
        const cost    = html.find("#new-ability-cost").val().trim();
        const pool    = html.find("#new-ability-pool").val();
        const desc    = html.find("#new-ability-desc").val().trim();

        if (!name) {
          // Flash the name field if empty
          html.find("#new-ability-name").css("border-color", "var(--might)");
          setTimeout(() => html.find("#new-ability-name").css("border-color", ""), 1200);
          return;
        }

        await this.actor.createEmbeddedDocuments("Item", [{
          name,
          type: "ability",
          system: {
            basic: {
              cost: cost ?? "0",
              pool: pool ?? "Pool",
            },
            description: desc,
          }
        }]);

        // Clear the form
        html.find("#new-ability-name").val("");
        html.find("#new-ability-cost").val("");
        html.find("#new-ability-pool").val("");
        html.find("#new-ability-desc").val("");
      });

      // ── Ability: Edit (opens Foundry's built-in item sheet) ────────────────
      html.find(".ability-edit").click(ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (item) item.sheet.render(true);
      });

      // ── Ability: Delete ────────────────────────────────────────────────────
      html.find(".item-delete-ability").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;

        const confirmed = await Dialog.confirm({
          title: "Delete Ability",
          content: `<p>Delete <strong>${item.name}</strong>? This cannot be undone.</p>`,
        });

        if (confirmed) await item.delete();
      });

      // ── Cypher: Add ────────────────────────────────────────────────────────
      html.find(".btn-add-cypher").click(async () => {
        const name  = html.find("#new-cypher-name").val().trim();
        const level = html.find("#new-cypher-level").val().trim();
        const form  = html.find("#new-cypher-form").val().trim();
        const desc  = html.find("#new-cypher-desc").val().trim();

        if (!name) {
          html.find("#new-cypher-name").css("border-color", "var(--might)");
          setTimeout(() => html.find("#new-cypher-name").css("border-color", ""), 1200);
          return;
        }

        await this.actor.createEmbeddedDocuments("Item", [{
          name,
          type: "cypher",
          system: {
            level:       level ? Number(level) : null,
            form:        form,
            description: desc,
          }
        }]);

        // Clear the form
        html.find("#new-cypher-name").val("");
        html.find("#new-cypher-level").val("");
        html.find("#new-cypher-form").val("");
        html.find("#new-cypher-desc").val("");
      });

      // ── Cypher: Edit ───────────────────────────────────────────────────────
      html.find(".cypher-edit").click(ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (item) item.sheet.render(true);
      });

      // ── Cypher: Delete ─────────────────────────────────────────────────────
      html.find(".cypher-delete").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;

        const confirmed = await Dialog.confirm({
          title: "Delete Cypher",
          content: `<p>Delete <strong>${item.name}</strong>? This cannot be undone.</p>`,
        });

        if (confirmed) await item.delete();
      });

      // ── Equipment: Add ─────────────────────────────────────────────────────
      html.find(".btn-add-equipment").click(async () => {
        const name = html.find("#new-equipment-name").val().trim();
        const qty  = html.find("#new-equipment-qty").val().trim();
        const desc = html.find("#new-equipment-desc").val().trim();

        if (!name) {
          html.find("#new-equipment-name").css("border-color", "var(--might)");
          setTimeout(() => html.find("#new-equipment-name").css("border-color", ""), 1200);
          return;
        }

        await this.actor.createEmbeddedDocuments("Item", [{
          name,
          type: "equipment",
          system: {
            quantity:    qty ? Number(qty) : 1,
            description: desc,
          }
        }]);

        // Clear the form
        html.find("#new-equipment-name").val("");
        html.find("#new-equipment-qty").val("");
        html.find("#new-equipment-desc").val("");
      });

      // ── Equipment: Edit ────────────────────────────────────────────────────
      html.find(".equipment-edit").click(ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (item) item.sheet.render(true);
      });

      // ── Equipment: Delete ──────────────────────────────────────────────────
      html.find(".equipment-delete").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;

        const confirmed = await Dialog.confirm({
          title: "Delete Equipment",
          content: `<p>Delete <strong>${item.name}</strong>? This cannot be undone.</p>`,
        });

        if (confirmed) await item.delete();
      });

      // ── Helper: fire the system's item roll ───────────────────────────────
      const itemRoll = async (itemId) => {
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await game.cyphersystem.itemRollMacro(
          this.actor,  // actor object — not UUID
          itemId,      // item ID — not UUID
          // remaining params left undefined so the function
          // reads defaults from item.system.settings.rollButton
        );
      };

      // ── Helper: open roll engine form for pool rolls ───────────────────────
      const poolRoll = async (pool) => {
        await game.cyphersystem.rollEngineForm({
          actorUuid: this.actor.uuid,
          pool: pool,
          title: `${this.actor.name}: ${pool} Roll`,
        });
      };

      // ── Skill roll ────────────────────────────────────────────────────────
      html.find(".skill-roll").click(async ev => {
        ev.preventDefault();
        await itemRoll(ev.currentTarget.dataset.itemId);
      });

      // ── Ability roll ──────────────────────────────────────────────────────
      html.find(".ability-roll").click(async ev => {
        ev.preventDefault();
        await itemRoll(ev.currentTarget.dataset.itemId);
      });

      // ── Attack roll ───────────────────────────────────────────────────────
      html.find(".attack-roll").click(async ev => {
        ev.preventDefault();
        await itemRoll(ev.currentTarget.dataset.itemId);
      });

      // ── Pool roll ─────────────────────────────────────────────────────────
      html.find(".pool-roll-btn").click(async ev => {
        ev.preventDefault();
        const pool = ev.currentTarget.dataset.pool;
        await poolRoll(pool);
      });

      // ── Recovery roll ─────────────────────────────────────────────────────
      html.find(".recovery-roll-btn").click(async ev => {
        ev.preventDefault();
        await game.cyphersystem.recoveryRollMacro(this.actor.uuid);
      });

      // ── Re-render when any owned item is updated via its own sheet ──────────
      this._itemUpdateHook = Hooks.on("updateItem", (item, changes, options, userId) => {
        if (item.parent?.id === this.actor.id) {
          this.render(false);
        }
      });

      this._itemDeleteHook = Hooks.on("deleteItem", (item, options, userId) => {
        if (item.parent?.id === this.actor.id) {
          this.render(false);
        }
      });

      this._itemCreateHook = Hooks.on("createItem", (item, options, userId) => {
        if (item.parent?.id === this.actor.id) {
          this.render(false);
        }
      });
    }

    async close(options) {
      Hooks.off("updateItem", this._itemUpdateHook);
      Hooks.off("deleteItem", this._itemDeleteHook);
      Hooks.off("createItem", this._itemCreateHook);
      return super.close(options);
    }

    async _updateObject(event, formData) {
      const expanded = foundry.utils.expandObject(formData);
      return this.actor.update(expanded);
    }
  }

  // ── Register sheet ─────────────────────────────────────────────────────
  Actors.registerSheet("cypherdark", CypherDarkSheet, {
    types: ["pc"],
    makeDefault: true,
    label: "Cypher Dark (OGoA)"
  });

  // Actors.unregisterSheet("cyphersystem", baseClass, { types: ["pc"] });

  // ── Base item sheet class ──────────────────────────────────────────────
  const baseItemClass = Object.values(CONFIG.Item.sheetClasses?.base ?? {})
    .find(s => s.id.startsWith("cypher"))?.cls
    ?? foundry.applications.sheets.ItemSheet;

  class CypherDarkItemSheet extends baseItemClass {

    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["cypherdark", "cypherdark-item"],
        template: "modules/cypherdark/templates/item-sheet.hbs",
        width: 520,
        height: 480,
        resizable: true,
      });
    }

    async getData() {
      const context = await super.getData();
      context.itemType = this.item.type;
      return context;
    }

    activateListeners(html) {
      super.activateListeners(html);
      if (!this.isEditable) return;

      // Live sync all inputs
      html.find("input, select, textarea").on("change", ev => {
        const el = ev.currentTarget;
        const field = el.name;
        if (!field) return;

        let value;
        if (el.type === "checkbox")    value = el.checked;
        else if (el.type === "number") value = el.value === "" ? null : Number(el.value);
        else                           value = el.value;

        this.item.update({ [field]: value });
      });
    }

    async _updateObject(event, formData) {
      const expanded = foundry.utils.expandObject(formData);
      return this.item.update(expanded);
    }
  }

  // Register for all item types
  const itemTypes = [
    "ability", "ammo", "armor", "artifact", "attack",
    "cypher", "equipment", "lasting-damage", "material",
    "oddity", "power-shift", "recursion", "skill", "tag"
  ];

  Items.registerSheet("cypherdark", CypherDarkItemSheet, {
    types: itemTypes,
    makeDefault: true,
    label: "Cypher Dark Item Sheet"
  });

  // // Unregister the system's default item sheet
  // const baseItemSheets = Object.values(CONFIG.Item.sheetClasses?.base ?? {})
  //   .filter(s => s.id.startsWith("cyphersystem"));

  // for (const sheet of baseItemSheets) {
  //   for (const type of itemTypes) {
  //     try {
  //       Items.unregisterSheet("cyphersystem", sheet.cls, { types: [type] });
  //     } catch(e) { /* some types may not have been registered */ }
  //   }
  // }

});