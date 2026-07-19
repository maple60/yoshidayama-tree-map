(function () {
  "use strict";

  const EMPTY_VALUE = "未登録";
  const DEFAULT_MARKER_RADIUS = 8;
  const SELECTED_MARKER_RADIUS = 11;

  function hasValue(value) {
    return value !== null
      && value !== undefined
      && String(value).trim() !== "";
  }

  // Google Sheets由来の値をLeafletのTooltip HTMLへ安全に渡す。
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function displayValue(value, suffix = "") {
    return hasValue(value) ? `${value}${suffix}` : EMPTY_VALUE;
  }

  function formatCoordinates(tree) {
    const latitude = Number(tree.latitude);
    const longitude = Number(tree.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return EMPTY_VALUE;
    }

    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }

  // パネルの固定DOMを一度だけ取得し、選択時は値だけを書き換える。
  function getDetailElements(panelElement) {
    return {
      empty: panelElement.querySelector("#tree-detail-empty"),
      content: panelElement.querySelector("#tree-detail-content"),
      name: panelElement.querySelector('[data-tree-detail="name"]'),
      scientific: panelElement.querySelector('[data-tree-detail="scientific"]'),
      recordId: panelElement.querySelector('[data-tree-detail="record-id"]'),
      year: panelElement.querySelector('[data-tree-detail="year"]'),
      plantedBy: panelElement.querySelector('[data-tree-detail="planted-by"]'),
      coordinates: panelElement.querySelector('[data-tree-detail="coordinates"]'),
      note: panelElement.querySelector('[data-tree-detail="note"]')
    };
  }

  function updateDetailPanel(elements, tree) {
    elements.empty.hidden = true;
    elements.content.hidden = false;
    elements.name.textContent = displayValue(tree.species_ja, "");
    elements.scientific.textContent = displayValue(tree.species_scientific, "");
    elements.scientific.hidden = !hasValue(tree.species_scientific);
    elements.recordId.textContent = displayValue(tree.record_id, "");
    elements.year.textContent = displayValue(tree.year, "年");
    if (elements.plantedBy) {
      elements.plantedBy.textContent = displayValue(tree.planted_by, "");
    }
    elements.coordinates.textContent = formatCoordinates(tree);
    elements.note.textContent = displayValue(tree.note, "");
  }

  function markerLabel(tree) {
    const name = displayValue(tree.species_ja, "");
    return hasValue(tree.record_id)
      ? `${name}（${tree.record_id}）`
      : name;
  }

  function setMarkerSelected(marker, selected, markerStyles) {
    marker.setStyle(selected ? markerStyles.selected : markerStyles.default);
    marker.setRadius(selected ? SELECTED_MARKER_RADIUS : DEFAULT_MARKER_RADIUS);

    const markerElement = marker.getElement();
    if (markerElement) {
      markerElement.classList.toggle("tree-marker-selected", selected);
      markerElement.setAttribute("aria-pressed", String(selected));
    }

    if (selected) marker.bringToFront();
  }

  // クリックとキーボード操作を同じ選択処理へ集約し、状態ずれを防ぐ。
  function makeMarkerAccessible(marker, tree, selectTree) {
    marker.once("add", () => {
      const markerElement = marker.getElement();
      if (!markerElement) return;

      const label = markerLabel(tree);
      markerElement.setAttribute("role", "button");
      markerElement.setAttribute("tabindex", "0");
      markerElement.setAttribute("aria-label", `${label}の詳細を表示`);
      markerElement.setAttribute("aria-controls", "tree-detail-panel");
      markerElement.setAttribute("aria-pressed", "false");
      if (hasValue(tree.record_id)) {
        markerElement.dataset.treeId = String(tree.record_id);
      }

      markerElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectTree(tree, marker);
        }
      });
    });
  }

  function createTreeMarker(tree, markerLayer, markerStyles, selectTree) {
    const latitude = Number(tree.latitude);
    const longitude = Number(tree.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const marker = L.circleMarker([latitude, longitude], {
      ...markerStyles.default,
      radius: DEFAULT_MARKER_RADIUS
    });

    marker.bindTooltip(escapeHtml(markerLabel(tree)));
    marker.on("click", () => selectTree(tree, marker));
    makeMarkerAccessible(marker, tree, selectTree);
    marker.addTo(markerLayer);

    return marker;
  }

  // 通常のページスクロールを妨げないよう、地図選択中だけWheel Zoomを使う。
  function configureWheelZoom(map, mapElement) {
    mapElement.addEventListener("click", () => {
      map.scrollWheelZoom.enable();
    });

    mapElement.addEventListener("mouseleave", () => {
      map.scrollWheelZoom.disable();
    });
  }

  function fitMapToMarkers(map, markerLayer) {
    const bounds = markerLayer.getBounds();
    if (!bounds.isValid()) return false;

    if (markerLayer.getLayers().length === 1) {
      map.setView(bounds.getCenter(), 18);
    } else {
      map.fitBounds(bounds, {
        padding: [32, 32],
        maxZoom: 18
      });
    }

    return true;
  }

  function initializeTreeMap() {
    const mapElement = document.getElementById("tree-map");
    const dataElement = document.getElementById("tree-map-data");
    const panelElement = document.getElementById("tree-detail-panel");

    if (!mapElement || !dataElement || !panelElement) return;

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
    configureWheelZoom(map, mapElement);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const theme = getComputedStyle(document.documentElement);
    const markerFill = theme.getPropertyValue("--bs-primary").trim()
      || "currentColor";
    const markerStroke = theme.getPropertyValue("--bs-body-color").trim()
      || "currentColor";
    const markerStyles = {
      default: {
        color: markerStroke,
        fillColor: markerFill,
        fillOpacity: 0.85,
        weight: 2
      },
      selected: {
        color: markerStroke,
        fillColor: markerFill,
        fillOpacity: 1,
        weight: 4
      }
    };

    const detailElements = getDetailElements(panelElement);
    const markerLayer = L.featureGroup().addTo(map);
    let selectedMarker = null;

    const selectTree = (tree, marker) => {
      if (selectedMarker && selectedMarker !== marker) {
        setMarkerSelected(selectedMarker, false, markerStyles);
      }

      setMarkerSelected(marker, true, markerStyles);
      selectedMarker = marker;
      updateDetailPanel(detailElements, tree);
    };

    trees.forEach((tree) => {
      createTreeMarker(tree, markerLayer, markerStyles, selectTree);
    });

    if (!fitMapToMarkers(map, markerLayer)) {
      mapElement.textContent = "表示できる位置情報がありません。";
      return;
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
