import { useState, useCallback, useEffect } from 'react'
import { Modal, Icon, Button } from '../ui'
import { addTimestampToUrl, getCameraImageUrl } from '../../utils/helpers'
import styles from './FullscreenView.module.css'

export default function FullscreenView({ camera, isOpen, onClose }) {
  const [imgSrc, setImgSrc] = useState('')
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    if (camera && isOpen) {
      setUsingFallback(false)
      setImgSrc(addTimestampToUrl(getCameraImageUrl(camera.SnapshotUrl)))
    }
  }, [camera, isOpen])

  const refresh = useCallback(() => {
    if (camera) {
      setUsingFallback(false)
      setImgSrc(addTimestampToUrl(getCameraImageUrl(camera.SnapshotUrl)))
    }
  }, [camera])

  if (!camera) return null

  const headerActions = (
    <Button size="sm" icon={<Icon name="refresh" size={16} />} onClick={refresh}>
      Refresh
    </Button>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={camera.CamName}
      size="fullscreen"
      headerActions={headerActions}
    >
      <div className={styles.container}>
        <img
          src={imgSrc}
          alt={camera.CamName}
          referrerPolicy="no-referrer"
          onError={() => {
            if (camera.FallbackSnapshotUrl && !usingFallback) {
              setUsingFallback(true)
              setImgSrc(addTimestampToUrl(camera.FallbackSnapshotUrl))
            }
          }}
        />
      </div>
    </Modal>
  )
}
