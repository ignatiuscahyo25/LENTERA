import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Report } from '../types';

interface RealMapProps {
  reports: Report[];
  onSelectReport: (id: number) => void;
}

function ResizeFix() {
  const map = useMap();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function RealMap({ reports, onSelectReport }: RealMapProps) {
  const validReports = reports.filter(
    (report) =>
      typeof report.latitude === 'number' &&
      typeof report.longitude === 'number' &&
      !Number.isNaN(report.latitude) &&
      !Number.isNaN(report.longitude)
  );

  const centerPosition: [number, number] =
    validReports.length > 0
      ? [validReports[0].latitude, validReports[0].longitude]
      : [-6.3634, 106.8285];

  return (
    <div className="w-full min-w-0 h-[260px] sm:h-[320px] md:h-[360px] lg:h-[380px] rounded-lg overflow-hidden border border-[#c4c6d1]">
      <MapContainer
        center={centerPosition}
        zoom={15}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        <ResizeFix />

        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {validReports.map((report) => (
          <Marker
            key={report.id}
            position={[report.latitude, report.longitude]}
            icon={markerIcon}
          >
            <Popup>
              <div style={{ minWidth: '180px' }}>
                <strong>ID Laporan: {report.id}</strong>
                <br />
                Status: {report.status}
                <br />
                Node: {report.node}
                <br />
                Koordinat:
                <br />
                {report.latitude}, {report.longitude}
                <br />
                <button
                  type="button"
                  onClick={() => onSelectReport(report.id)}
                  style={{
                    marginTop: '8px',
                    padding: '6px 10px',
                    background: '#00193c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                >
                  Lihat Detail
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}