import { useEffect, useRef, useState } from 'react';
import {
  createMapImageDraft,
  deleteMapImage,
  fetchAdminMapImage,
  fetchAdminMapImages,
  setMapImagePublished,
  updateMapImage,
  uploadMapImageFile,
} from '../../api/adminApi';
import { fetchOwnShop } from '../../api/shopAdminApi';
import { useAsync } from '../../hooks/useAsync';
import styles from './AdminMapImages.module.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function AdminImagePreview({ image }) {
  const [preview, setPreview] = useState({ imageUrl: '', src: '', error: '' });

  useEffect(() => {
    if (!image.imageUrl) return undefined;
    let active = true;
    let objectUrl = '';
    fetchAdminMapImage(image.imageUrl).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview({ imageUrl: image.imageUrl, src: objectUrl, error: '' });
    }).catch((loadError) => {
      if (active) setPreview({ imageUrl: image.imageUrl, src: '', error: loadError.message });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.imageUrl]);

  if (preview.imageUrl === image.imageUrl && preview.error) return <div className={styles.previewFallback}>Preview unavailable</div>;
  if (preview.imageUrl !== image.imageUrl || !preview.src) return <div className={styles.previewFallback}>Loading preview...</div>;
  return <img className={styles.thumbnail} src={preview.src} alt="" />;
}

export default function AdminMapImages() {
  const { data: images, error: loadError, loading, refetch } = useAsync(fetchAdminMapImages);
  const { data: shop, loading: shopLoading, error: shopError } = useAsync(fetchOwnShop);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);
  const editingImage = images?.find((image) => image.id === editingId);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function resetEditor() {
    setEditingId(null);
    setTitle(null);
    setFile(null);
    setPreviewUrl('');
    setProgress(0);
    setError('');
    setMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function editImage(image) {
    setEditingId(image.id);
    setTitle(image.title);
    setFile(null);
    setPreviewUrl('');
    setProgress(0);
    setError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    setError('');
    setMessage('');
    if (selected && !ACCEPTED_TYPES.includes(selected.type)) {
      setFile(null);
      setPreviewUrl('');
      setError('Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setPreviewUrl('');
      setError('Images may be up to 5 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : '');
  }

  async function saveImage(publish = false) {
    if (busy) return;
    setError('');
    setMessage('');
    if (!editingId && !file) {
      setError('Choose an image before saving.');
      return;
    }
    if (!shop?.name) {
      setError(shopError?.message || 'Your shop name could not be loaded.');
      return;
    }
    if ((title ?? shop.name).trim().length < 2 || (title ?? shop.name).trim().length > 100) {
      setError('Shop name must be between 2 and 100 characters.');
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const details = {
        title: (title ?? shop.name).trim(),
      };
      let image = editingId
        ? await updateMapImage(editingId, details)
        : await createMapImageDraft(details);
      setEditingId(image.id);
      if (file) image = await uploadMapImageFile(image.id, file, setProgress);
      if (publish) image = await setMapImagePublished(image.id, true);
      await refetch({ quiet: true });
      setMessage(publish
        ? 'Shop photo published to Discover.'
        : image.status === 'PUBLISHED'
          ? 'Shop photo updated and remains published.'
          : 'Shop photo saved as a draft.');
      setFile(null);
      setPreviewUrl('');
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!editingId) setEditingId(image.id);
    } catch (saveError) {
      setError(saveError.message || 'The map image could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function changePublication(image, published) {
    setError('');
    setMessage('');
    try {
      await setMapImagePublished(image.id, published);
      await refetch({ quiet: true });
      setMessage(published ? 'Shop photo published to Discover.' : 'Shop photo moved back to drafts.');
    } catch (publishError) {
      setError(publishError.message || 'The publication status could not be changed.');
    }
  }

  async function removeImage(image) {
    if (!window.confirm(`Delete "${image.title}" and its uploaded image? This cannot be undone.`)) return;
    setError('');
    setMessage('');
    try {
      await deleteMapImage(image.id);
      if (editingId === image.id) resetEditor();
      await refetch({ quiet: true });
      setMessage('Map image deleted.');
    } catch (deleteError) {
      setError(deleteError.message || 'The map image could not be deleted.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>SHOP ADMIN</p>
          <h1>Shop photo</h1>
          <p>Upload your shop photo for customers to see on Discover.</p>
        </div>
      </header>

      <section className={styles.editor} aria-labelledby="editor-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="editor-title">{editingId ? 'Edit shop photo' : 'Upload a shop photo'}</h2>
            <p>JPG, PNG, or WebP up to 5 MB. New photos stay private until published.</p>
          </div>
          {editingId && <button className={styles.textButton} type="button" onClick={resetEditor}>New image</button>}
        </div>
        <div>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Shop name</span>
              <input
                value={title ?? shop?.name ?? ''}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={shopLoading ? 'Loading shop name...' : 'Enter shop name'}
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          </div>
          {shopError && <p className={styles.error} role="alert">{shopError.message}</p>}
          <div className={styles.uploadRow}>
            <button
              className={styles.filePicker}
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? 'Choose a different image' : editingId ? 'Replace image (optional)' : 'Choose image'}
            </button>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={chooseFile}
            />
            {file && <span className={styles.fileName}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>}
          </div>
          {(previewUrl || (editingId && images?.find((image) => image.id === editingId)?.imageUrl)) && (
            <div className={styles.previewArea}>
              {previewUrl
                ? <img className={styles.preview} src={previewUrl} alt={`Preview of ${file?.name || 'selected image'}`} />
                : <AdminImagePreview image={images.find((image) => image.id === editingId)} />}
            </div>
          )}
          {busy && file && (
            <div className={styles.progressWrap} role="status" aria-live="polite">
              <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
              <span>Uploading image: {progress}%</span>
            </div>
          )}
          <div className={styles.formActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={busy || shopLoading || !shop?.name}
              onClick={() => saveImage(false)}
            >
              {busy ? 'Saving...' : editingImage?.status === 'PUBLISHED' ? 'Save changes' : 'Save as draft'}
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy || shopLoading || !shop?.name}
              onClick={() => saveImage(true)}
            >
              {busy ? 'Saving...' : 'Send / publish to map'}
            </button>
          </div>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.success} role="status">{message}</p>}
      </section>

      <section className={styles.library} aria-labelledby="library-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="library-title">Shop photos</h2>
            <p>Only published photos are visible to customers in Discover.</p>
          </div>
        </div>
        {loading && <p className={styles.notice}>Loading map images...</p>}
        {loadError && <p className={styles.error} role="alert">{loadError.message}</p>}
        {!loading && !loadError && (images || []).length === 0 && (
          <p className={styles.empty}>No map images uploaded yet. Choose an image above to get started.</p>
        )}
        <div className={styles.imageGrid}>
          {(images || []).map((image) => (
            <article className={styles.imageCard} key={image.id}>
              <div className={styles.cardImage}>
                {image.imageUrl
                  ? <AdminImagePreview image={image} />
                  : <div className={styles.previewFallback}>No image uploaded</div>}
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}>
                  <h3>{image.title}</h3>
                  <span className={`${styles.status} ${image.status === 'PUBLISHED' ? styles.published : ''}`}>
                    {image.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                  </span>
                </div>
                <small>Uploaded {image.uploadedAt ? new Date(image.uploadedAt).toLocaleString() : 'not yet'}</small>
                <div className={styles.cardActions}>
                  <button className={styles.textButton} type="button" onClick={() => editImage(image)}>Edit / replace</button>
                  {image.status === 'PUBLISHED'
                    ? <button className={styles.textButton} type="button" onClick={() => changePublication(image, false)}>Unpublish</button>
                    : <button className={styles.textButton} type="button" disabled={!image.imageUrl} onClick={() => changePublication(image, true)}>Publish</button>}
                  <button className={styles.dangerButton} type="button" onClick={() => removeImage(image)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
