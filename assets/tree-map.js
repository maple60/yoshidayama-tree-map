(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function popupContent(tree) {
    const name = escapeHtml(tree.species_ja || "名称未設定");
    const scientific = tree.species_scientific
      ? `<em class="tree-popup-scientific">${escapeHtml(tree.species_scientific)}</em>`
      : "";
    const metadata = [tree.record_id, tree.year]
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map(escapeHtml)
      .join(" · ");
    const metaLine = metadata
      ? `<span class="tree-popup-meta">${metadata}</span>`
      : "";
    const note = tree.note
      ? `<span class="tree-popup-note">${escapeHtml(tree.note)}</span>`
      : "";

    return `<strong class="tree-popup-name">${name}</strong>${scientific}${metaLine}${note}`;
  }

  function initializeTreeMap() {
    const mapElement = document.getElementById("tree-map");
    const dataElement = document.getElementById("tree-map-data");

    if (!mapElement || !dataElement) return;

    if (!window.L) {
      mapElement.textContent = "地図ライブラリを読み込めませんでした。";
      return;
    }

    let trees;
    try {
      trees = JSON.parse(dataElement.textContent);
    } catch (error) {
      mapElement.textContent = "立木データを読み込めませんでした。";
      return;
    }

    const map = L.map(mapElement, {
      scrollWheelZoom: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const theme = getComputedStyle(document.documentElement);
    const markerFill = theme.getPropertyValue("--bs-primary").trim()
      || "currentColor";
    const markerStroke = theme.getPropertyValue("--bs-body-color").trim()
      || "currentColor";
    const markerLayer = L.featureGroup().addTo(map);

    trees.forEach((tree) => {
      const latitude = Number(tree.latitude);
      const longitude = Number(tree.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const marker = L.circleMarker([latitude, longitude], {
        radius: 8,
        color: markerStroke,
        fillColor: markerFill,
        fillOpacity: 0.85,
        weight: 2
      });

      const markerLabel = tree.species_ja || tree.record_id || "立木";
      marker.bindTooltip(escapeHtml(markerLabel));
      marker.bindPopup(popupContent(tree));
      marker.once("add", () => {
        const markerElement = marker.getElement();
        if (!markerElement) return;

        markerElement.setAttribute("role", "button");
        markerElement.setAttribute("tabindex", "0");
        markerElement.setAttribute("aria-label", `${markerLabel}の詳細`);
        markerElement.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            marker.openPopup();
          }
        });
      });
      marker.addTo(markerLayer);
    });

    const bounds = markerLayer.getBounds();
    if (!bounds.isValid()) {
      mapElement.textContent = "表示できる位置情報がありません。";
      return;
    }

    if (markerLayer.getLayers().length === 1) {
      map.setView(bounds.getCenter(), 18);
    } else {
      map.fitBounds(bounds, {
        padding: [32, 32],
        maxZoom: 18
      });
    }

    L.control.scale({ imperial: false }).addTo(map);
    requestAnimationFrame(() => map.invalidateSize());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTreeMap, { once: true });
  } else {
    initializeTreeMap();
  }
})();
