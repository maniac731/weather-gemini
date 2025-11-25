const app = getApp();

Page({
  data: {
    forecasts: []
  },

  onShow() {
    // 对于 TabBar 页面，在 onShow 中获取数据并初始化
    const forecasts = app.globalData.forecastsData;
    if (forecasts && forecasts.length > 0) {
      this.setData({ forecasts }, () => {
        this.drawTempChart();
        this.drawHumidityChart();
      });
    }
  },

  // 绘制气温趋势图
  drawTempChart() {
    const query = wx.createSelectorQuery();
    query.select('#temp-chart').boundingClientRect(rect => {
      // 1. 检查节点是否存在以及宽高
      if (!rect || !rect.width || !rect.height) {
        console.warn('未找到气温Canvas节点或宽高为0');
        return;
      }

      // 2. 加上 this 确保作用域正确
      const ctx = wx.createCanvasContext('temp-chart', this);
      const forecasts = this.data.forecasts;

      if (!forecasts || forecasts.length === 0) return;

      const canvasWidth = rect.width;
      const canvasHeight = rect.height;
      const padding = 30; // 边距
      const chartWidth = canvasWidth - padding * 2;
      const chartHeight = canvasHeight - padding * 2;

      // 获取数据范围
      // 3. 确保数据是数字类型，并处理 tempRange 为0的情况
      const temps = forecasts.flatMap(f => [parseFloat(f.temp_min), parseFloat(f.temp_max)]);
      const minTemp = Math.floor(Math.min(...temps) - 2); // 留出一些裕量
      const maxTemp = Math.ceil(Math.max(...temps) + 2);  // 留出一些裕量
      const tempRange = maxTemp - minTemp || 1; // 防止除以0

      // 清空画布
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 绘制网格线和Y轴标签
      ctx.setStrokeStyle('#f0f0f0');
      ctx.setLineWidth(1);
      const gridLines = 5;
      for (let i = 0; i <= gridLines; i++) {
        const y = padding + (chartHeight / gridLines) * i;
        ctx.beginPath(); // 开始新路径
        ctx.moveTo(padding, y); // 移动到起点
        ctx.lineTo(canvasWidth - padding, y); // 画线到终点
        ctx.stroke(); // 描边

        const temp = maxTemp - (tempRange / gridLines) * i;
        ctx.setFillStyle('#999');
        ctx.setFontSize(10);
        ctx.fillText(temp.toFixed(0) + '°', 5, y + 4);
      }

      // 绘制X轴标签
      forecasts.forEach((forecast, i) => {
        // 4. 防止只有一个数据点时分母为0
        const xStep = forecasts.length > 1 ? (chartWidth / (forecasts.length - 1)) : 0;
        const x = padding + xStep * i;

        // 确保 dateDisplay 存在
        const label = (forecast.dateDisplay || '').replace('今天', '').trim();
        ctx.setFillStyle('#666');
        ctx.setFontSize(11);
        ctx.setTextAlign('center');
        // 如果只有一个点，居中显示
        const drawX = forecasts.length > 1 ? x : canvasWidth / 2;
        ctx.fillText(label, drawX, canvasHeight - padding + 20);
      });

      // --- 绘制最高气温 ---
      this.drawSingleLine(ctx, forecasts, 'temp_max', '#ff7675', minTemp, tempRange, padding, chartWidth, chartHeight);

      // --- 绘制最低气温 ---
      this.drawSingleLine(ctx, forecasts, 'temp_min', '#74b9ff', minTemp, tempRange, padding, chartWidth, chartHeight);

      // 绘制图例
      this.drawLegend(ctx, canvasWidth);

      ctx.draw();
    }).exec();
  },

  // 辅助函数：绘制单条折线
  drawSingleLine(ctx, forecasts, key, color, minVal, range, padding, chartWidth, chartHeight) {
    ctx.setStrokeStyle(color);
    ctx.setLineWidth(2);
    ctx.beginPath();

    const xStep = forecasts.length > 1 ? (chartWidth / (forecasts.length - 1)) : 0;

    // 第一遍：画线
    forecasts.forEach((forecast, i) => {
      // 居中处理（如果只有一个点）
      let x = padding + xStep * i;
      if (forecasts.length === 1) x = padding + chartWidth / 2;

      // --- 关键修复：处理带 % 的字符串或非数值 ---
      let val = forecast[key];
      if (typeof val === 'string') {
        val = parseFloat(val.replace('%', '')); // 去掉 % 并转数字
      }
      // 如果转换失败，默认为 minVal
      if (isNaN(val)) val = minVal;

      const y = padding + chartHeight - ((val - minVal) / range) * chartHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // 第二遍：画圆点
    ctx.setFillStyle(color);
    forecasts.forEach((forecast, i) => {
      let x = padding + xStep * i;
      if (forecasts.length === 1) x = padding + chartWidth / 2;

      let val = forecast[key];
      if (typeof val === 'string') val = parseFloat(val.replace('%', ''));
      if (isNaN(val)) val = minVal;

      const y = padding + chartHeight - ((val - minVal) / range) * chartHeight;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();

      // 可选：在点上方显示数值
      // ctx.setFontSize(10);
      // ctx.setTextAlign('center');
      // ctx.fillText(Math.round(val), x, y - 8);
    });
  },

  // 辅助函数：绘制图例
  drawLegend(ctx, canvasWidth) {
    ctx.setTextAlign('left');
    ctx.setFontSize(10); // 调整字体大小以适应空间

    // 最高气温
    ctx.setFillStyle('#ff7675');
    ctx.fillRect(canvasWidth - 140, 8, 10, 10); // 调整位置
    ctx.setFillStyle('#333');
    ctx.fillText('最高气温', canvasWidth - 125, 17); // 调整位置

    // 最低气温
    ctx.setFillStyle('#74b9ff');
    ctx.fillRect(canvasWidth - 70, 8, 10, 10); // 调整位置
    ctx.setFillStyle('#333');
    ctx.fillText('最低气温', canvasWidth - 55, 17); // 调整位置
  },

  // 绘制湿度与降雨趋势图
  drawHumidityChart() {
    wx.createSelectorQuery().select('#humidity-chart').boundingClientRect(rect => {
      if (!rect || !rect.width || !rect.height) {
        console.warn('未找到湿度Canvas节点或宽高为0');
        return;
      }
      const ctx = wx.createCanvasContext('humidity-chart', this); // <--- 加上 this
      const forecasts = this.data.forecasts;

      if (!forecasts || forecasts.length === 0) return;

      const canvasWidth = rect.width;
      const canvasHeight = rect.height;
      const padding = 30;
      const chartWidth = canvasWidth - padding * 2;
      const chartHeight = canvasHeight - padding * 2;

      // 获取数据范围 (0% - 100%)
      const minValue = 0;
      const maxValue = 100;
      const valueRange = maxValue - minValue;

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 绘制网格线和Y轴标签
      ctx.setStrokeStyle('#f0f0f0');
      ctx.setLineWidth(1);
      const gridLines = 4; // 0, 25, 50, 75, 100
      for (let i = 0; i <= gridLines; i++) {
        const y = padding + (chartHeight / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvasWidth - padding, y);
        ctx.stroke();

        const value = maxValue - (valueRange / gridLines) * i;
        ctx.setFillStyle('#999'); // 颜色
        ctx.setFontSize(10); // 字体大小
        ctx.fillText(value.toFixed(0) + '%', 5, y + 4);
      }

      // 绘制X轴标签
      forecasts.forEach((forecast, i) => {
        const x = padding + (chartWidth / (forecasts.length - 1)) * i;
        const label = forecast.dateDisplay.replace('今天', '').trim();
        ctx.setFillStyle('#666');
        ctx.setFontSize(11); // 字体大小
        ctx.setTextAlign('center');
        ctx.fillText(label, x, canvasHeight - padding + 20);
      });

      // --- 绘制降雨概率 ---
      this.drawSingleLine(ctx, forecasts, 'rain_probability_display', '#4facfe', minValue, valueRange, padding, chartWidth, chartHeight); // 数据键名

      // --- 绘制平均湿度 ---
      this.drawSingleLine(ctx, forecasts, 'avg_humidity_display', '#00b894', minValue, valueRange, padding, chartWidth, chartHeight); // 数据键名

      // 绘制图例
      ctx.setTextAlign('left');
      ctx.setFontSize(10); // 调整字体大小
      ctx.setFillStyle('#4facfe');
      ctx.fillRect(canvasWidth - 140, 8, 10, 10); // 调整位置
      ctx.setFillStyle('#333');
      ctx.fillText('降雨概率', canvasWidth - 125, 17); // 调整位置
      ctx.setFillStyle('#00b894');
      ctx.fillRect(canvasWidth - 70, 8, 10, 10); // 调整位置
      ctx.setFillStyle('#333');
      ctx.fillText('平均湿度', canvasWidth - 55, 17); // 调整位置

      ctx.draw();
    }).exec();
  },

  goBack() {
    // TabBar 页面之间用 switchTab
    wx.switchTab({ url: '/pages/index/index' });
  }
});