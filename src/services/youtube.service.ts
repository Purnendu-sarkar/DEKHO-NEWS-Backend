// Mock YouTube Integration Service

export const getYouTubeChannelInfo = async (accessToken: string) => {
  // In production, this would call GET https://www.googleapis.com/youtube/v3/channels
  console.log('Mock: Fetching YouTube channel info with token', accessToken);
  return {
    id: 'UC' + Math.random().toString(36).substring(7),
    title: 'Mock YouTube Channel',
    thumbnail: 'https://via.placeholder.com/150',
  };
};

export const fetchLatestYouTubeVideos = async (channelId: string) => {
  // In production, this would call GET https://www.googleapis.com/youtube/v3/search or playlistItems
  console.log(`Mock: Fetching latest videos for channel ${channelId}`);
  
  // Return dummy videos for auto-import simulation
  return [
    {
      id: 'video1_' + Date.now(),
      title: 'Breaking News: Something happened today!',
      description: 'Full coverage of the event from YouTube.',
      type: 'VIDEO',
      thumbnailUrl: 'https://via.placeholder.com/400x225',
    },
    {
      id: 'short1_' + Date.now(),
      title: '#Shorts Local Update',
      description: 'Quick local news update.',
      type: 'SHORT',
      thumbnailUrl: 'https://via.placeholder.com/225x400',
    }
  ];
};
