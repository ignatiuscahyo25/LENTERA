import React from 'react';

import * as maplibregl from 'maplibre-gl';

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

import 'maplibre-gl/dist/maplibre-gl.css';

maplibregl.setWorkerUrl(workerUrl);

import type { Report } from '../types';

import {
  offlineStyle,
  JABODETABEK_CENTER,
  JAVA_BOUNDS
} from '../maps/offlineStyle';

// ========================================
// PROPS
// ========================================

interface RealMapProps {
  reports: Report[];
  onSelectReport: (id: number) => void;
}

// ========================================
// REPORT WITH VALID LOCATION
// ========================================

type ReportWithLocation = Report & {
  latitude: number;
  longitude: number;
};

// ========================================
// VALIDATE GPS
// ========================================

const hasValidLocation = (
  report: Report
): report is ReportWithLocation => {
  return (
    report.latitude !== null &&
    report.latitude !== undefined &&
    report.longitude !== null &&
    report.longitude !== undefined &&
    Number.isFinite(report.latitude) &&
    Number.isFinite(report.longitude) &&
    report.latitude >= -90 &&
    report.latitude <= 90 &&
    report.longitude >= -180 &&
    report.longitude <= 180
  );
};

// ========================================
// CHECK OFFLINE COVERAGE
// ========================================

function insideJavaCoverage(
  longitude: number,
  latitude: number
): boolean {
  return (
    longitude >= JAVA_BOUNDS[0] &&
    latitude >= JAVA_BOUNDS[1] &&
    longitude <= JAVA_BOUNDS[2] &&
    latitude <= JAVA_BOUNDS[3]
  );
}

// ========================================
// SOS MARKER
// ========================================

function createSOSMarker(): HTMLDivElement {
  const element = document.createElement('div');

  element.className = 'lentera-marker';

  element.style.width = '22px';
  element.style.height = '22px';
  element.style.backgroundColor = '#dc2626';
  element.style.border = '3px solid white';
  element.style.borderRadius = '50%';
  element.style.boxShadow =
    '0 2px 8px rgba(0,0,0,0.35)';
  element.style.cursor = 'pointer';
  element.style.boxSizing = 'content-box';

  return element;
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function RealMap({
  reports,
  onSelectReport
}: RealMapProps) {

  const containerRef =
    React.useRef<HTMLDivElement | null>(null);

  const mapRef =
    React.useRef<maplibregl.Map | null>(null);

  const markersRef =
    React.useRef<maplibregl.Marker[]>([]);

  const callbackRef =
    React.useRef(onSelectReport);

  const [mapError, setMapError] =
    React.useState<string | null>(null);

  const [mapReady, setMapReady] =
    React.useState(false);

  const validReports = React.useMemo(
    () => reports.filter(hasValidLocation),
    [reports]
  );

  React.useEffect(() => {
    callbackRef.current = onSelectReport;
  }, [onSelectReport]);

  // ========================================
  // INITIALIZE MAP ONCE
  // ========================================

  React.useEffect(() => {

    if (!containerRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: offlineStyle,
      center: JABODETABEK_CENTER,
      zoom: 10,
      minZoom: 2,
      maxZoom: 18,
      attributionControl: false
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(),
      'top-right'
    );

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true
      }),
      'bottom-right'
    );

    map.on('load', () => {
      setMapReady(true);
      map.resize();
    });

    map.on('error', event => {
      console.error(
        '[LENTERA REAL MAP]',
        event.error
      );

      setMapError(
        'Sebagian data peta offline gagal dimuat. ' +
        'Periksa TileServer pada port 8080.'
      );
    });

    return () => {
      markersRef.current.forEach(
        marker => marker.remove()
      );

      markersRef.current = [];

      mapRef.current = null;

      map.remove();
    };

  }, []);

  // ========================================
  // UPDATE MARKERS AND CAMERA
  // ========================================

  React.useEffect(() => {

    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    markersRef.current.forEach(
      marker => marker.remove()
    );

    markersRef.current = [];

    validReports.forEach(report => {

      const position: [number, number] = [
        report.longitude,
        report.latitude
      ];

      const popupContent =
        document.createElement('div');

      popupContent.style.minWidth = '190px';
      popupContent.style.fontSize = '12px';
      popupContent.style.lineHeight = '1.8';

      const rows: Array<[string, string]> = [
        ['ID Laporan', String(report.messageId ?? report.id)],
        ['Status', String(report.status)],
        ['Node', String(report.node)],
        ['Jumlah Korban', `${report.victimCount} orang`],
        [
          'Sumber Lokasi',
          String(report.locationSource || 'UNKNOWN')
        ],
        [
          'Koordinat',
          `${report.latitude}, ${report.longitude}`
        ]
      ];

      if (
        report.locationAccuracy !== null &&
        report.locationAccuracy !== undefined
      ) {
        rows.push([
          'Akurasi',
          `${report.locationAccuracy} meter`
        ]);
      }

      rows.forEach(([label, value]) => {
        const row = document.createElement('div');

        const title = document.createElement('strong');
        title.textContent = `${label}: `;

        const text = document.createTextNode(value);

        row.appendChild(title);
        row.appendChild(text);

        popupContent.appendChild(row);
      });

      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = 'Lihat Detail';

      Object.assign(button.style, {
        marginTop: '8px',
        padding: '6px 10px',
        background: '#00193c',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 'bold'
      });

      button.addEventListener('click', () => {
        callbackRef.current(report.id);
      });

      popupContent.appendChild(button);

      const popup = new maplibregl.Popup({
        offset: 16,
        maxWidth: '280px'
      }).setDOMContent(popupContent);

      const marker = new maplibregl.Marker({
        element: createSOSMarker()
      })
        .setLngLat(position)
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // No SOS: focus on Jabodetabek
    if (validReports.length === 0) {

      map.jumpTo({
        center: JABODETABEK_CENTER,
        zoom: 10
      });

      return;
    }

    // Single SOS: focus on victim
    if (validReports.length === 1) {

      map.jumpTo({
        center: [
          validReports[0].longitude,
          validReports[0].latitude
        ],
        zoom: 13
      });

      return;
    }

    // Multiple SOS: show all markers
    const bounds =
      new maplibregl.LngLatBounds();

    validReports.forEach(report => {
      bounds.extend([
        report.longitude,
        report.latitude
      ]);
    });

    map.fitBounds(bounds, {
      padding: 30,
      maxZoom: 13,
      duration: 0
    });

  }, [validReports, mapReady]);

  const outOfCoverageCount =
    validReports.filter(
      report => !insideJavaCoverage(
        report.longitude,
        report.latitude
      )
    ).length;

  return (
    <div
      className="
        relative
        w-full
        min-w-0
        h-[260px]
        sm:h-[320px]
        md:h-[360px]
        lg:h-[380px]
        rounded-lg
        overflow-hidden
        border
        border-[#c4c6d1]
        bg-[#e0f2fe]
      "
    >

      <div
        ref={containerRef}
        className="w-full h-full"
      />

      {mapError && (
        <div
          className="
            absolute top-3 left-3 right-14 z-10
            bg-white/95 border border-red-300
            text-red-700 text-xs rounded p-2
            shadow-md
          "
        >
          {mapError}
        </div>
      )}

      {outOfCoverageCount > 0 && (
        <div
          className="
            absolute top-14 left-3 right-3 z-10
            bg-white/95 border border-amber-300
            text-amber-800 text-xs rounded p-2
          "
        >
          {outOfCoverageCount} laporan berada di luar
          cakupan peta offline Jawa.
          Koordinat laporan tetap tersimpan.
        </div>
      )}

      {validReports.length === 0 && (
        <div
          className="
            absolute bottom-3 left-3 right-3 z-10
            bg-white/95 border border-[#c4c6d1]
            rounded-lg p-3 shadow-md
            pointer-events-none
          "
        >

          <p className="text-xs font-bold text-[#00193c]">
            Belum ada koordinat SOS yang valid
          </p>

          <p className="text-[11px] text-[#43474f] mt-1">
            Peta offline Jawa tersedia melalui
            TileServer lokal. Marker korban akan
            muncul otomatis setelah laporan
            dengan koordinat GPS yang valid diterima.
          </p>

        </div>
      )}

    </div>
  );
}
