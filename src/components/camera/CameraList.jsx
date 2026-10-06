import { memo, useCallback } from 'react'
import { useCamera } from '../../context/CameraContext'
import { Icon } from '../ui'
import { getCameraImageUrl } from '../../utils/helpers'
import styles from './CameraList.module.css'

const CameraList = memo(function CameraList({ cameras, onSelect }) {
  const { activeCamera, isBookmarked, toggleBookmark } = useCamera()

  const handleBookmark = useCallback(
    (e, camId) => {
      e.stopPropagation()
      toggleBookmark(camId)
    },
    [toggleBookmark]
  )

  if (cameras.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon name="search" size={48} strokeWidth={1} />
        <p>No cameras found</p>
      </div>
    )
  }

  // Virtual list - render only first 50 for performance
  const visibleCameras = cameras.slice(0, 50)

  return (
    <div className={styles.list}>
      {visibleCameras.map((cam) => (
        <CameraItem
          key={cam.CamId}
          camera={cam}
          isActive={activeCamera === cam.CamId}
          isBookmarked={isBookmarked(cam.CamId)}
          onSelect={onSelect}
          onBookmark={handleBookmark}
        />
      ))}
      {cameras.length > 50 && (
        <div className={styles.moreHint}>
          Showing 50 of {cameras.length}. Use filters to narrow results.
        </div>
      )}
    </div>
  )
})

const CameraItem = memo(function CameraItem({
  camera,
  isActive,
  isBookmarked,
  onSelect,
  onBookmark,
}) {
  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      onClick={() => onSelect(camera)}
    >
      <div className={styles.thumb}>
        <img
          src={getCameraImageUrl(camera.SnapshotUrl)}
          data-fallback={camera.FallbackSnapshotUrl || ''}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => {
            const fallback = e.currentTarget.dataset.fallback
            if (fallback && e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback
              return
            }
            e.currentTarget.style.display = 'none'
          }}
        />
      </div>
      <div className={styles.info}>
        <h4 className={styles.name}>{camera.CamName}</h4>
        <div className={styles.meta}>
          <span className={styles.tag}>{camera.District || 'TP.HCM'}</span>
          {camera.VideoStreaming && <span className={`${styles.tag} ${styles.live}`}>LIVE</span>}
        </div>
      </div>
      <div className={styles.actions}>
        <button
          className={`${styles.actionBtn} ${isBookmarked ? styles.bookmarked : ''}`}
          onClick={(e) => onBookmark(e, camera.CamId)}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          <Icon
            name="bookmark"
            size={14}
            fill={isBookmarked ? 'currentColor' : 'none'}
          />
        </button>
      </div>
    </div>
  )
})

export default CameraList
