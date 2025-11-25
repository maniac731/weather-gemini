// app.js
App({
  onLaunch() {
    // Check login status
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) this.globalData.userInfo = userInfo;
    
    // Get system info for layout
    wx.getSystemInfo({
      success: (res) => { this.globalData.systemInfo = res; }
    });
  },
  
  globalData: {
    userInfo: null,
    systemInfo: null,
    location: null,
    preferences: {
      workStart: '09:00',
      workEnd: '18:00',
      preference: 0.5
    }
  },
  
  weatherConfig: {
    openMeteoUrl: 'https://api.open-meteo.com/v1/forecast'
  },

  // 1. Fetch Weather Data
  async fetchWeather(lat, lon) {
    try {
      console.log('Fetching weather for:', lat, lon);
      const params = {
        latitude: lat,
        longitude: lon,
        hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,precipitation_probability,uv_index',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max',
        timezone: 'auto',
        forecast_days: 5
      };
      
      const queryString = Object.keys(params)
        .map(key => `${key}=${params[key]}`)
        .join('&');
        
      const url = `${this.weatherConfig.openMeteoUrl}?${queryString}`;
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: url,
          method: 'GET',
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode === 200 && res.data) {
        return res.data;
      }
      return this.getMockWeatherData(lat, lon); // Fallback
    } catch (error) {
      console.error('Weather API Error:', error);
      return this.getMockWeatherData(lat, lon); // Fallback
    }
  },
  
  // 2. Calculate Index (The Algorithm)
  calculateDryingIndex(temp, wind, humidity, cloud, uv = 0) {
    // Weights
    const wTemp = 1.0;
    const wWind = 1.8; // Wind is very important for drying
    const wHum = 0.6;
    const wCloud = 0.3;
    const wUV = 1.2;   // Sun helps a lot

    // Normalize inputs roughly to 0-10 scale logic internally
    let score = 
      (temp * wTemp) + 
      (wind * wWind) + 
      (uv * wUV * 5) - 
      (humidity * wHum * 0.5) - 
      (cloud * wCloud * 0.2);
      
    // Base offset to make typical good days land around 60-80
    score += 20;

    return Math.max(0, Math.min(100, score));
  },
  
  // 3. Process Data for UI
  processForecast(data) {
    const daily = data.daily || {};
    const hourly = data.hourly || {};
    const forecasts = [];
    
    // Helper to map hourly arrays to objects
    const hourlyObjs = hourly.time.map((t, i) => ({
      time: t,
      temp: hourly.temperature_2m[i],
      humidity: hourly.relative_humidity_2m[i],
      wind: hourly.wind_speed_10m[i],
      cloud: hourly.cloud_cover[i],
      rainProb: hourly.precipitation_probability[i],
      uv: hourly.uv_index ? hourly.uv_index[i] : 0
    }));

    // Process 5 Days
    for (let i = 0; i < 5; i++) {
      const dayStr = daily.time[i]; // "2023-10-24"
      const dayHourlyData = hourlyObjs.filter(h => h.time.startsWith(dayStr));
      
      // Calculate Daily Averages
      const avgTemp = this.arrAvg(dayHourlyData.map(h => h.temp));
      const avgHum = this.arrAvg(dayHourlyData.map(h => h.humidity));
      const avgWind = this.arrAvg(dayHourlyData.map(h => h.wind));
      const maxRain = Math.max(...dayHourlyData.map(h => h.rainProb));
      
      // Calculate Score
      const dryingIndex = this.calculateDryingIndex(avgTemp, avgWind, avgHum, 20, 5); // Simplified for daily avg
      
      // === NEW LOGIC: Calculate 3-Phase Status ===
      const phases = {
        morning: { scores: [], status: 'gray' },   // 08:00 - 12:00
        noon: { scores: [], status: 'gray' },      // 12:00 - 15:00
        afternoon: { scores: [], status: 'gray' }  // 15:00 - 18:00
      };

      // Use existing dayHourlyData for phase calculation
      dayHourlyData.forEach(h => {
        const hour = parseInt(h.time.substring(11, 13));
        const score = this.calculateDryingIndex(h.temp, h.wind, h.humidity, h.cloud, h.uv);
        
        // Sort scores into phases
        if (hour >= 8 && hour < 12) phases.morning.scores.push(score);
        else if (hour >= 12 && hour < 15) phases.noon.scores.push(score);
        else if (hour >= 15 && hour <= 18) phases.afternoon.scores.push(score);
      });

      // Helper to determine color for a phase
      const getPhaseStatus = (scores) => {
        if (!scores.length) return 'gray';
        const avg = scores.reduce((a,b)=>a+b,0) / scores.length;
        if (avg >= 70) return 'green';
        if (avg >= 30) return 'orange';
        return 'gray'; // Poor drying
      };

      const phaseData = {
        morning: getPhaseStatus(phases.morning.scores),
        noon: getPhaseStatus(phases.noon.scores),
        afternoon: getPhaseStatus(phases.afternoon.scores)
      };
      // ===========================================

      // === TIMELINE LOGIC: Process Each Hour for Today Only ===
      let processedHourly = [];
      let dryingPills = []; // For the new pill timeline
      if (i === 0) { // Only for today
        processedHourly = dayHourlyData.map(h => {
          const hourNum = parseInt(h.time.substring(11, 13));
          const isNight = hourNum < 6 || hourNum > 19;
          
          // Calculate specific hourly score
          let hScore = this.calculateDryingIndex(h.temp, h.wind, h.humidity, h.cloud, h.uv);
          if (isNight) hScore -= 30; // Drying is bad at night
          if (h.rainProb > 40) hScore = 0; // Rain kills drying

          let status = 'poor';
          let color = 'gray';
          
          if (h.rainProb > 40) {
              status = 'rain';
              color = 'blue';
          } else if (hScore >= 70) {
              status = 'good';
              color = 'green';
          } else if (hScore >= 30) {
              status = 'fair';
              color = 'orange';
          }

          return {
            timeDisplay: h.time.substring(11, 16), // "14:00"
            score: Math.max(0, Math.min(100, hScore)), // 0-100
            temp: h.temp,
            status: status,
            color: color
          };
        });

        // --- NEW: Pill Ranges Calculation ---
        const slotWidth = 120; // rpx, should match WXSS
        let currentPill = null;

        processedHourly.forEach((hour, index) => {
          // Define "good for drying" status
          const isGood = hour.status === 'good'; // 只将 'good' 状态视为适宜晾晒

          if (isGood) {
            if (!currentPill) {
              // Start a new pill
              currentPill = {
                startIdx: index,
                startTime: hour.timeDisplay,
                length: 1
              };
            } else {
              // Continue the current pill
              currentPill.length++;
            }
          }

          // If status is not good, or it's the last hour, end the current pill
          if ((!isGood || index === processedHourly.length - 1) && currentPill) {
            const endHourIndex = currentPill.startIdx + currentPill.length;
            const endTime = processedHourly[endHourIndex] ? processedHourly[endHourIndex].timeDisplay : `${parseInt(currentPill.startTime) + currentPill.length}:00`;

            dryingPills.push({
              left: currentPill.startIdx * slotWidth,
              width: currentPill.length * slotWidth,
              label: `${currentPill.startTime} - ${endTime}`,
              isLong: currentPill.length > 1
            });
            currentPill = null; // Reset for the next pill
          }
        });
        // --- End of Pill Ranges Calculation ---
      }

      // Recommendation Text
      let rec = "不适合晾晒";
      let color = "red";
      if (maxRain > 50) { rec = "有雨风险"; color = "blue"; }
      else if (dryingIndex >= 70) { rec = "非常适合"; color = "green"; }
      else if (dryingIndex >= 30) { rec = "可以晾晒"; color = "orange"; }

      forecasts.push({
        date: dayStr,
        dateDisplay: this.formatDateDisplay(dayStr),
        drying_index: dryingIndex,
        drying_index_display: Math.round(dryingIndex),
        avg_temp_display: avgTemp.toFixed(1),
        avg_humidity_display: Math.round(avgHum),
        avg_wind_display: avgWind.toFixed(1),
        rain_probability_display: Math.round(maxRain),
        recommendation: rec,
        color: color,
        phases: phaseData, // <--- Add this new property
        hourly_data: processedHourly, // Only for today
        drying_pills: dryingPills, // Add new pill data for today
        temp_max: daily.temperature_2m_max[i],
        temp_min: daily.temperature_2m_min[i]
      });
    }
    return forecasts;
  },

  // Helpers
  arrAvg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; },
  formatDateDisplay(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.getDate() === now.getDate()) return "今天";
    return `${d.getMonth()+1}月${d.getDate()}日`;
  },
  getMockWeatherData(lat, lon) {
    // Return simplified mock structure to prevent crash
    const now = new Date();
    const hourly = { time: [], temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], cloud_cover: [], precipitation_probability: [], uv_index: [] };
    const daily = { time: [] };
    
    for(let i=0; i<5; i++) {
        const d = new Date(now); d.setDate(d.getDate()+i);
        daily.time.push(d.toISOString().split('T')[0]);
    }
    // Generate 120 hours (5 days * 24)
    for(let i=0; i<120; i++) {
        hourly.time.push(new Date(now.getTime() + i*3600000).toISOString());
        hourly.temperature_2m.push(20 + Math.sin(i/10)*5);
        hourly.relative_humidity_2m.push(50);
        hourly.wind_speed_10m.push(10);
        hourly.cloud_cover.push(20);
        hourly.precipitation_probability.push(0);
        hourly.uv_index.push(i%24 > 8 && i%24 < 18 ? 5 : 0);
    }
    return { latitude: lat, longitude: lon, hourly, daily };
  }
})