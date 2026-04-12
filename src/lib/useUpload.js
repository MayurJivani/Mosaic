import { useState, useCallback } from "react"

const HTTP_URL = import.meta.env.PUBLIC_WS_URL 
  ? import.meta.env.PUBLIC_WS_URL.replace("ws://", "http://").replace("wss://", "https://")
  : "http://localhost:4322"

export function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)   // 0–100

  const upload = useCallback(async (file) => {
    setUploading(true)
    setProgress(0)

    try {
      // Use window.location.hostname to make it work across LAN if 
      // someone is viewing from their phone when not using a specified PUBLIC_WS_URL
      const serverBase = import.meta.env.PUBLIC_WS_URL 
        ? HTTP_URL 
        : `http://${window.location.hostname}:4322`

      // Upload via XHR so we can track progress
      const url = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `${serverBase}/upload?name=${encodeURIComponent(file.name)}`)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }

        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText)
            if (res.error) { reject(new Error(res.error)); return }
            
            // The local server returns a path like "/files/timestamp_name.mp4"
            resolve(serverBase + res.url)
          } catch (e) { reject(e) }
        }
        
        xhr.onerror = () => reject(new Error("Network error during upload"))
        
        // Directly send the file blob
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.send(file)
      })

      setProgress(100)
      return url

    } catch (err) {
      console.warn("[useUpload] Upload failed, falling back to blob URL:", err.message)
      // Graceful fallback to local blob so the canvas stays usable in dev
      return URL.createObjectURL(file)
    } finally {
      setUploading(false)
    }
  }, [])

  return { upload, uploading, progress }
}