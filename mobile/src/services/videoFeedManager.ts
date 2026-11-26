export interface VideoChainItem {
  id: string | number;
  videoUrl: string;
  poster?: string;
  authorName?: string;
  authorAvatar?: string;
  communityName?: string;
  content?: string;
  likesCount?: number;
  commentsCount?: number;
}

type OpenListener = (index: number, videos: VideoChainItem[]) => void;

class VideoFeedManager {
  private videos: VideoChainItem[] = [];
  private openListener?: OpenListener;

  setFeedVideos(videos: VideoChainItem[]) {
    this.videos = videos.filter((v) => !!v.videoUrl);
  }

  getVideos(): VideoChainItem[] {
    return this.videos;
  }

  registerOpenListener(cb: OpenListener) {
    this.openListener = cb;
  }

  unregisterOpenListener() {
    this.openListener = undefined;
  }

  openChain(videoUrlOrId: string | number, fallbackItem?: VideoChainItem) {
    let idx = this.videos.findIndex(
      (v) => String(v.id) === String(videoUrlOrId) || v.videoUrl === videoUrlOrId
    );

    if (idx === -1) {
      if (fallbackItem && fallbackItem.videoUrl) {
        this.videos = [fallbackItem, ...this.videos];
        idx = 0;
      } else {
        const item: VideoChainItem = {
          id: videoUrlOrId,
          videoUrl: String(videoUrlOrId),
        };
        this.videos = [item, ...this.videos];
        idx = 0;
      }
    }

    if (this.openListener) {
      this.openListener(idx, this.videos);
    }
  }
}

export const videoFeedManager = new VideoFeedManager();
