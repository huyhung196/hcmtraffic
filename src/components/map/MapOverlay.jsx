import { useState, useCallback, useRef } from 'react'
import { useCamera } from '../../context/CameraContext'
import { useToast } from '../ui/Toast'
import { Icon, Button } from '../ui'
import { formatTime } from '../../utils/helpers'
import styles from './MapOverlay.module.css'

export default function MapOverlay({ onGridOpen }) {
  const { stats, loadCamerasFromFile } = useCamera()
  const { addToast } = useToast()
  const fileInputRef = useRef(null)
  const [lastUpdate] = useState(formatTime())

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFile = useCallback(
    (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result)
          loadCamerasFromFile(data)
          addToast(`Loaded ${data.length} cameras`, 'success')
        } catch {
          addToast('Invalid JSON file', 'error')
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [loadCamerasFromFile, addToast]
  )

  const handleCenter = useCallback(() => {
    // Dispatch custom event for map to handle
    window.dispatchEvent(new CustomEvent('map:center'))
  }, [])

  return (
    <div className={styles.overlay}>
      <div className={styles.statusBar}>
        <div className={styles.statusItem}>
          <span className={styles.statusDot} />
          <span className={styles.statusLabel}>System:</span>
          <span className={styles.statusValue}>Online</span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>Updated:</span>
          <span className={styles.statusValue}>{lastUpdate}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          variant="default"
          icon={<Icon name="target" size={20} />}
          onClick={handleCenter}
          title="Center Map"
        />
        <Button
          variant="default"
          icon={<Icon name="grid" size={20} />}
          onClick={onGridOpen}
          title="Matrix View"
          className={styles.gridBtn}
        >
          {stats.bookmarkCount > 0 && (
            <span className={styles.badge}>{stats.bookmarkCount}</span>
          )}
        </Button>
        <Button
          variant="default"
          icon={<Icon name="upload" size={20} />}
          onClick={handleUpload}
          title="Upload JSON"
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
    </div>
  )
}
