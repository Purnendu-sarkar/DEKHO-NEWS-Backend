export const checkForSpam = (title: string, description: string): boolean => {
  const blacklist = ['spam', 'scam', 'fake news', 'click here to win', 'buy this', 'free money'];
  
  const content = `${title} ${description}`.toLowerCase();
  
  for (const word of blacklist) {
    if (content.includes(word)) {
      return true; // Contains spam
    }
  }
  
  return false;
};
