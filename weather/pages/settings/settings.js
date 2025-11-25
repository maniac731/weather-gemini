// pages/settings/settings.js
const app = getApp();

Page({
  data: {
    workStart: '09:00',
    workEnd: '18:00',
    preferenceValue: 5,
    preferenceText: '平衡模式'
  },

  onLoad() {
    this.loadSettings();
  },

  loadSettings() {
    const preferences = wx.getStorageSync('preferences') || app.globalData.preferences;
    this.setData({
      workStart: preferences.workStart,
      workEnd: preferences.workEnd,
      preferenceValue: preferences.preference * 10,
      preferenceText: this.getPreferenceText(preferences.preference)
    });
  },

  onWorkStartChange(e) {
    this.setData({ workStart: e.detail.value });
  },

  onWorkEndChange(e) {
    this.setData({ workEnd: e.detail.value });
  },

  onPreferenceChange(e) {
    const value = e.detail.value;
    const preference = value / 10;
    this.setData({
      preferenceValue: value,
      preferenceText: this.getPreferenceText(preference)
    });
  },

  getPreferenceText(preference) {
    if (preference <= 0.3) return '安全优先（慢干但稳妥）';
    if (preference <= 0.7) return '平衡模式（兼顾速度和安全）';
    return '速度优先（快速晾晒但有风险）';
  },

  saveSettings() {
    const preferences = {
      workStart: this.data.workStart,
      workEnd: this.data.workEnd,
      preference: this.data.preferenceValue / 10
    };

    wx.setStorageSync('preferences', preferences);
    app.globalData.preferences = preferences;

    wx.showToast({
      title: '设置保存成功',
      icon: 'success',
      duration: 2000
    });

    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },

  resetSettings() {
    wx.showModal({
      title: '确认恢复默认',
      content: '确定要恢复所有设置为默认值吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            preferenceValue: 5,
            workStart: '09:00',
            workEnd: '18:00'
          });
          
          wx.showToast({
            title: '已恢复默认设置',
            icon: 'success'
          });
        }
      }
    });
  }
});