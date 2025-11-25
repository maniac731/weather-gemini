// pages/index/index.js
const app = getApp();

Page({
  data: {
    location: null,
    todayForecast: null,
    forecasts: [],
    loading: false,
    error: null,
    slotWidth: 120 // 每个时间格子的宽度(rpx)，与app.js中计算时保持一致
  },

  onLoad() {
    // Try to load saved location
    const savedLoc = wx.getStorageSync('location');
    if (savedLoc) {
      this.setData({ location: savedLoc });
      this.fetchWeather();
    } else {
      // If no location, trigger selection automatically
      this.handleChooseLocation();
    }
  },

  // SECURITY FIX: Use Manual Selection
  handleChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        const location = {
          lat: res.latitude,
          lon: res.longitude,
          address: res.name // Use the place name directly
        };
        
        this.setData({ location });
        wx.setStorageSync('location', location);
        app.globalData.location = location;
        
        this.fetchWeather();
      },
      fail: () => {
        console.log('Location selection cancelled');
        // If users cancels and has no location, maybe show a default
        if (!this.data.location) {
            this.setData({ 
                location: { lat: 39.90, lon: 116.40, address: '北京 (默认)' } 
            });
            this.fetchWeather();
        }
      }
    });
  },

  async fetchWeather() {
    if (!this.data.location) return;

    this.setData({ loading: true, error: null });

    try {
      const weatherData = await app.fetchWeather(
        this.data.location.lat, 
        this.data.location.lon
      );

      const forecasts = app.processForecast(weatherData);
      
      // Set Today's Data
      this.setData({
        todayForecast: forecasts[0],
        forecasts: forecasts,
        loading: false
      });

    } catch (error) {
      console.error('Weather fetch error:', error);
      this.setData({ loading: false, error: '网络错误，无法获取天气' });
    }
  },

  goToForecast() {
    if (this.data.forecasts.length) {
      // For TabBar pages, pass data via globalData
      app.globalData.forecastsData = this.data.forecasts;
      wx.switchTab({ url: '/pages/forecast/forecast' });
    }
  },
  
  goToSettings() {
      wx.navigateTo({ url: '/pages/settings/settings' });
  }
});