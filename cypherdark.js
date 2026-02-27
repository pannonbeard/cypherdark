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
      // Trained → Specialized → Unskilled → Trained
      html.find(".skill-cycle").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;

        const levels = ["Unskilled", "Trained", "Specialized"];
        const current = item.system.skillLevel ?? "Trained";
        const next = levels[(levels.indexOf(current) + 1) % levels.length];
        await item.update({ "system.skillLevel": next });
      });

      // ── Skill: Toggle inability ────────────────────────────────────────────
      html.find(".skill-inability").click(async ev => {
        const id = ev.currentTarget.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) return;

        const isInability = item.system.skillLevel === "Inability";
        await item.update({
          "system.skillLevel": isInability ? "Trained" : "Inability"
        });
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

      console.log(this.actor)
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

});