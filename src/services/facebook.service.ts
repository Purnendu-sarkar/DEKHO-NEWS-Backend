// Mock Facebook Integration Service

export const getFacebookPageInfo = async (accessToken: string) => {
  // In production, this would call GET https://graph.facebook.com/v19.0/me/accounts
  console.log('Mock: Fetching Facebook page info with token', accessToken);
  return {
    id: 'FB' + Math.random().toString(36).substring(7),
    name: 'Mock Facebook Page',
    thumbnail: 'https://via.placeholder.com/150',
  };
};

export const fetchLatestFacebookPosts = async (pageId: string) => {
  // In production, this would call GET https://graph.facebook.com/v19.0/{pageId}/posts
  console.log(`Mock: Fetching latest posts for page ${pageId}`);
  
  // Return dummy posts for auto-import simulation
  return [
    {
      id: 'post1_' + Date.now(),
      title: 'Community Update Post',
      description: 'Here are some details about the community update.',
      type: 'READ',
      photoUrl: 'https://via.placeholder.com/600x400',
    }
  ];
};
