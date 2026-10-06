import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster'
import { useCamera } from '../../context/CameraContext'
import CameraPopup from '../camera/CameraPopup'
import { createRoot } from 'react-dom/client'

const HCMC_CENTER = [10.7769, 106.7009]

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom camera icon
const createCameraIcon = (isLive) => {
  const color = isLive ? '#10b981' : '#ec4899'
  const shadow = isLive ? 'rgba(16,185,129,0.4)' : 'rgba(236,72,153,0.4)'

  return L.divIcon({
    html: `
      <div style="
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          width: 36px;
          height: 36px;
          background: ${color};
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 3px 12px ${shadow};
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
        </div>
      </div>
    `,
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  })
}

// Cluster icon
const createClusterIcon = (count) => {
  let size = 48
  let fontSize = '14px'
  if (count > 100) {
    size = 64
    fontSize = '16px'
  } else if (count > 30) {
    size = 56
    fontSize = '15px'
  }

  return L.divIcon({
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: linear-gradient(135deg, #f472b6, #ec4899);
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 4px 15px rgba(236,72,153,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: ${fontSize};
        font-family: system-ui, sans-serif;
      ">
        ${count}
      </div>
    `,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  })
}

function MapController({ onFullscreen }) {
  const map = useMap()
  const { filteredCameras, activeCamera, setActiveCamera } = useCamera()
  const clusterRef = useRef(null)
  const rootsRef = useRef(new Map())

  // Initialize cluster
  useEffect(() => {
    if (!map) return

    // Create cluster group
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16,
      iconCreateFunction: (c) => createClusterIcon(c.getChildCount()),
    })

    clusterRef.current = cluster
    map.addLayer(cluster)

    return () => {
      map.removeLayer(cluster)
    }
  }, [map])

  // Update markers
  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return

    // Clear old
    cluster.clearLayers()
    rootsRef.current.forEach((root) => root.unmount())
    rootsRef.current.clear()

    // Add markers
    filteredCameras.forEach((camera) => {
      if (!camera.Lat || !camera.Lng) return

      const marker = L.marker([camera.Lat, camera.Lng], {
        icon: createCameraIcon(camera.VideoStreaming),
      })

      // Popup container
      const container = document.createElement('div')
      container.style.minWidth = '350px'

      marker.bindPopup(container, {
        maxWidth: 400,
        minWidth: 350,
      })

      marker.on('popupopen', () => {
        let root = rootsRef.current.get(camera.CamId)
        if (!root) {
          root = createRoot(container)
          rootsRef.current.set(camera.CamId, root)
        }
        root.render(<CameraPopup camera={camera} onFullscreen={onFullscreen} />)
        setActiveCamera(camera.CamId)
      })

      marker.on('popupclose', () => {
        setActiveCamera(null)
      })

      cluster.addLayer(marker)
    })

    console.log('Added', filteredCameras.length, 'markers to map')
  }, [filteredCameras, setActiveCamera, onFullscreen])

  // Fly to active camera
  useEffect(() => {
    if (!activeCamera || !clusterRef.current) return

    const camera = filteredCameras.find((c) => c.CamId === activeCamera)
    if (camera) {
      map.flyTo([camera.Lat, camera.Lng], 16, { duration: 1 })
    }
  }, [activeCamera, filteredCameras, map])

  return null
}

export default function MapView({ onFullscreen }) {
  return (
    <MapContainer
      center={HCMC_CENTER}
      zoom={12}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <MapController onFullscreen={onFullscreen} />
    </MapContainer>
  )
}
