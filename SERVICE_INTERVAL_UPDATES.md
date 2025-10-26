# 🐌 Service Interval Updates

**Slowed down all Warframe API checks to reduce spam and ensure fresh data**

## 📊 Updated Intervals

### **Before vs After:**

| Service | Before | After | Change |
|---------|--------|-------|--------|
| **Fissure Service** | 30 seconds | **2 minutes** | 4x slower |
| **Arbitration Service** | 30 seconds | **2 minutes** | 4x slower |
| **Aya Service** | 1 minute | **3 minutes** | 3x slower |
| **Baro Service** | 5 minutes | **10 minutes** | 2x slower |
| **Incarnon Service** | 1 hour | **2 hours** | 2x slower |

## 🔧 Detailed Changes

### **1. Fissure Service (`src/services/fissureService.ts`)**
- **Base interval**: 30 seconds → **2 minutes**
- **Minimum check time**: 10 seconds → **30 seconds**
- **Frequent checks**: 5 minutes → **10 minutes** before expiry
- **Minimum frequent check**: 30 seconds → **2 minutes**

### **2. Arbitration Service (`src/services/arbitrationService.ts`)**
- **Base interval**: 30 seconds → **2 minutes**
- **Maximum interval**: 1 minute → **5 minutes**
- **Minimum check time**: 10 seconds → **30 seconds**
- **Frequent checks**: 5 minutes → **10 minutes** before expiry
- **Minimum frequent check**: 30 seconds → **2 minutes**

### **3. Aya Service (`src/services/ayaService.ts`)**
- **Base interval**: 1 minute → **3 minutes**
- **Frequent checks**: 5 minutes → **10 minutes** before reset
- **Check after reset**: 10 seconds → **2 minutes**

### **4. Baro Service (`src/services/baroService.ts`)**
- **Base interval**: 5 minutes → **10 minutes**

### **5. Incarnon Service (`src/services/incarnonService.ts`)**
- **Base interval**: 1 hour → **2 hours**
- **Frequent checks**: 2 hours → **4 hours** before reset
- **Check after reset**: 30 seconds → **5 minutes**
- **Immediate check delay**: 1 minute → **5 minutes**

## 🎯 Benefits

### **Reduced API Spam:**
- ✅ **4x fewer requests** to Warframe APIs
- ✅ **Less server load** on external APIs
- ✅ **More respectful** API usage
- ✅ **Reduced rate limiting** issues

### **Better Data Quality:**
- ✅ **More time** for APIs to update
- ✅ **Fresh data** on each check
- ✅ **Reduced false positives** from stale data
- ✅ **More accurate** notifications

### **Improved Performance:**
- ✅ **Less CPU usage** on bot server
- ✅ **Reduced network traffic**
- ✅ **Better resource management**
- ✅ **More stable** service operation

## 📈 Smart Frequency Adjustments

### **Still Responsive When Needed:**
- **Frequent checks** when events are **soon** (10 minutes before)
- **Immediate checks** when events **just happened**
- **Adaptive intervals** based on event timing
- **Error handling** with exponential backoff

### **Examples:**
- **Arbitration ending in 8 minutes** → Checks every 2 minutes
- **Aya reset in 7 minutes** → Checks every 2 minutes  
- **Incarnon rotation in 3 hours** → Checks every 2 hours
- **Event just ended** → Immediate check + 5 minute follow-up

## 🚀 Result

**Perfect balance** between:
- ✅ **Responsive notifications** when needed
- ✅ **Reduced spam** during normal operation  
- ✅ **Fresh data** on each check
- ✅ **Respectful API usage**

**No more "ran too recently" spam!** 🎉
