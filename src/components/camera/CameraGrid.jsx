import { useState, useCallback } from 'react'
import { useCamera } from '../../context/CameraContext'
import { Modal, Icon, Button } from '../ui'
import { addTimestampToUrl, getCameraImageUrl } from '../../utils/helpers'
import styles from './CameraGrid.module.css'

export default function CameraGrid({ isOpen, onClose }) {
  const { getBookmarkedCameras, toggleBookmark } = useCamera()
  const [gridSize, setGridSize] = useState(4) // 4 = 2x2, 9 = 3x3

  const cameras = getBookmarkedCameras()

  const handleRemove = useCallback(
    (camId) => {
      toggleBookmark(camId)
    },
    [toggleBookmark]
  )

  const refreshAll = useCallback(() => {
    document.querySelectorAll(`.${styles.cellImage} img`).forEach((img) => {
      delete img.dataset.fallbackUsed
      img.src = addTimestampToUrl(getCameraImageUrl(img.dataset.source))
    })
  }, [])

  const headerActions = (
    <div className={styles.controls}>
      <Button
        size="sm"
        variant={gridSize === 4 ? 'primary' : 'default'}
        onClick={() => setGridSize(4)}
      >
        2x2
      </Button>
      <Button
        size="sm"
        variant={gridSize === 9 ? 'primary' : 'default'}
        onClick={() => setGridSize(9)}
      >
        3x3
      </Button>
      <Button size="sm" icon={<Icon name="refresh" size={16} />} onClick={refreshAll}>
        Refresh All
      </Button>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Matrix View (${cameras.length} cameras)`}
      size="fullscreen"
      headerActions={headerActions}
    >
      {cameras.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="bookmark" size={64} strokeWidth={1} />
          <h3>No bookmarked cameras</h3>
          <p>Click the bookmark icon on cameras to add them to Matrix View</p>
        </div>
      ) : (
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `repeat(${gridSize === 4 ? 2 : 3}, 1fr)`,
          }}
        >
          {Array.from({ length: gridSize }).map((_, i) => {
            const cam = cameras[i]
            if (!cam) {
              return (
                <div key={i} className={`${styles.cell} ${styles.empty}`}>
                  <span>Empty slot</span>
                </div>
              )
            }
            return (
              <div key={cam.CamId} className={styles.cell}>
                <div className={styles.cellHeader}>
                  <span className={styles.cellTitle}>{cam.CamName}</span>
                  <button
                    className={styles.cellRemove}
                    onClick={() => handleRemove(cam.CamId)}
                    aria-label="Remove"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
                <div className={styles.cellImage}>
                  <img
                    src={addTimestampToUrl(getCameraImageUrl(cam.SnapshotUrl))}
                    data-source={cam.SnapshotUrl}
                    data-fallback={cam.FallbackSnapshotUrl || ''}
                    alt={cam.CamName}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const fallback = e.currentTarget.dataset.fallback
                      if (fallback && !e.currentTarget.dataset.fallbackUsed) {
                        e.currentTarget.dataset.fallbackUsed = 'true'
                        e.currentTarget.src = addTimestampToUrl(fallback)
                      }
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
