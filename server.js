const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Weather Bot Webhook'
    });
});

app.post('/webhook', async (req, res) => {
    const { queryResult, session } = req.body;
    const intentName = queryResult.intent.displayName;
    const parameters = queryResult.parameters;
    const queryText = queryResult.queryText;
    
    console.log('Intent:', intentName);
    console.log('Parameters:', parameters);
    console.log('Query:', queryText);
    console.log('Session:', session);
    
    let response = {};
    
    try {
        switch (intentName) {
            case 'Current-Weather':
            case 'weather.current':
                response = await handleCurrentWeather(parameters, session, queryText);
                break;
                
            case 'Forecast-Weather':
            case 'weather.forecast':
                response = await handleWeatherForecast(parameters, session, queryText);
                break;

            case 'Thanks-Goodbye':
                response = handleThanksGoodbye(session);
                break;
                
            case 'Final-Goodbye':
                response = handleFinalGoodbye(session);
                break;
                
            case 'Current-Weather-City-Followup':
            case 'weather.current.city-followup':
                response = await handleCityFollowup(parameters, session, 'current');
                break;
                
            case 'Weather-Forecast-City-Followup':
            case 'weather.forecast.city-followup':
                response = await handleCityFollowup(parameters, session, 'forecast');
                break;
                
            default:
                response = {
                    fulfillmentText: "I can help you with weather information! Try asking: What's the weather in London? or Show me forecast for New York or Weather in your city."
                };
        }
    } catch (error) {
        console.error('Error:', error.message);
        response = {
            fulfillmentText: "Sorry, I'm having trouble getting weather information right now. Please try again in a moment."
        };
    }
    
    console.log('Response:', response.fulfillmentText?.substring(0, 100) + '...');
    
    res.json(response);
});

function handleThanksGoodbye(session) {
    const responses = [
        "You're welcome! Is there anything else I can help you with regarding weather information?",
        "Glad I could help! Do you need weather information for any other locations?",
        "Happy to assist! Would you like to check weather for another city or date?",
        "You're welcome! Any other weather questions I can answer for you?",
        "My pleasure! Is there anything else weather-related you'd like to know?"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    return {
        fulfillmentText: randomResponse,
        outputContexts: [
            {
                name: `${session}/contexts/awaiting-final-response`,
                lifespanCount: 2,
                parameters: {}
            }
        ]
    };
}

// Handle final goodbye
function handleFinalGoodbye(session) {
    const responses = [
        "Thanks for using the Weather Bot! Stay safe and have a great day!",
        "You're all set! Thanks for using our weather service. Take care!",
        "Perfect! Thanks for choosing our weather bot. Have a wonderful day!",
        "Great! Thanks for using the weather service. Stay dry and stay safe!",
        "Awesome! Thanks for using our weather bot. Have a fantastic day ahead!"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    return {
        fulfillmentText: randomResponse
    };
}

async function handleCurrentWeather(parameters, session, queryText) {
    let city = parameters.city;
    
    if (!city || city.trim() === '') {
        return {
            fulfillmentText: "Which city would you like to know the weather for? Just tell me any city name like London, New York, or Karachi.",
            outputContexts: [
                {
                    name: `${session}/contexts/weather-city-missing`,
                    lifespanCount: 3,
                    parameters: {
                        requestType: 'current',
                        originalQuery: queryText
                    }
                }
            ]
        };
    }
    
    try {
        const weatherText = await getCurrentWeather(city, queryText);
        return { fulfillmentText: weatherText };
    } catch (error) {
        if (error.message.includes('city not found')) {
            return {
                fulfillmentText: `Sorry, I couldn't find weather data for "${city}". Please check the spelling or try a nearby major city.`
            };
        }
        throw error;
    }
}

async function handleWeatherForecast(parameters, session, queryText) {
    let city = parameters.city;
    const dateTime = parameters['date-time'];
    const datePeriod = parameters['date-period'];
    
    if (!city || city.trim() === '') {
        return {
            fulfillmentText: "Which city would you like the weather forecast for? Just tell me any city name.",
            outputContexts: [
                {
                    name: `${session}/contexts/weather-forecast-missing`,
                    lifespanCount: 3,
                    parameters: {
                        requestType: 'forecast',
                        originalQuery: queryText,
                        dateTime: dateTime,
                        datePeriod: datePeriod
                    }
                }
            ]
        };
    }
    
    try {
        const forecastText = await getWeatherForecast(city, dateTime, datePeriod, queryText);
        return { fulfillmentText: forecastText };
    } catch (error) {
        if (error.message.includes('city not found')) {
            return {
                fulfillmentText: `Sorry, I couldn't find weather data for "${city}". Please check the spelling or try a nearby major city.`
            };
        }
        throw error;
    }
}

async function handleCityFollowup(parameters, session, requestType) {
    const city = parameters.city;
    
    if (!city || city.trim() === '') {
        return {
            fulfillmentText: "Please tell me a city name so I can get the weather information for you."
        };
    }
    
    try {
        if (requestType === 'current') {
            const weatherText = await getCurrentWeather(city, '');
            return { fulfillmentText: weatherText };
        } else if (requestType === 'forecast') {
            const weatherText = await getCurrentWeather(city, '');
            return { fulfillmentText: weatherText };
        }
    } catch (error) {
        if (error.message.includes('city not found')) {
            return {
                fulfillmentText: `Sorry, I couldn't find weather data for "${city}". Please check the spelling or try a nearby major city.`
            };
        }
        throw error;
    }
    
    return { fulfillmentText: "Let me get that weather information for you!" };
}

async function getCurrentWeather(city, queryText) {
    const cleanCity = validateAndCleanCity(city);
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cleanCity)}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    
    try {
        const response = await axios.get(url);
        const weather = response.data;
        
        const requestType = analyzeQuery(queryText);
        
        return formatCurrentWeatherResponse(weather, requestType);
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new Error('city not found');
        }
        console.error('OpenWeather API Error:', error.response?.data || error.message);
        throw error;
    }
}

async function getWeatherForecast(city, dateTime, datePeriod, queryText) {
    const cleanCity = validateAndCleanCity(city);
    
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanCity)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    
    try {
        const geoResponse = await axios.get(geoUrl);
        
        if (geoResponse.data.length === 0) {
            throw new Error('city not found');
        }
        
        const { lat, lon, name, country } = geoResponse.data[0];
        
        const forecastConfig = determineForecastConfig(dateTime, datePeriod, queryText);
        
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
        
        const forecastResponse = await axios.get(forecastUrl);
        const forecast = forecastResponse.data;
        
        return formatForecastResponse(forecast, name, country, forecastConfig);
        
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new Error('city not found');
        }
        console.error('OpenWeather API Error:', error.response?.data || error.message);
        throw error;
    }
}

function analyzeQuery(queryText) {
    if (!queryText) return { full: true };
    
    const query = queryText.toLowerCase();
    
    return {
        temperature: /\b(temperature|temp|hot|cold|degree|celsius|fahrenheit)\b/.test(query) && /\b(only|just|tell me)\b/.test(query),
        humidity: /\b(humidity|humid|moisture)\b/.test(query) && /\b(only|just|tell me)\b/.test(query),
        wind: /\b(wind|breeze|gust)\b/.test(query) && /\b(only|just|tell me)\b/.test(query),
        pressure: /\b(pressure|atmospheric)\b/.test(query) && /\b(only|just|tell me)\b/.test(query),
        full: true
    };
}

function formatCurrentWeatherResponse(weather, requestType) {
    const cityName = `${weather.name}, ${weather.sys.country}`;
    
    if (requestType.temperature && !requestType.full) {
        return `Temperature in ${cityName}: ${Math.round(weather.main.temp)}°C (feels like ${Math.round(weather.main.feels_like)}°C)`;
    }
    
    if (requestType.humidity && !requestType.full) {
        return `Humidity in ${cityName}: ${weather.main.humidity}%`;
    }
    
    if (requestType.wind && !requestType.full) {
        return `Wind in ${cityName}: ${weather.wind.speed} m/s`;
    }
    
    if (requestType.pressure && !requestType.full) {
        return `Pressure in ${cityName}: ${weather.main.pressure} hPa`;
    }
    
    return `Current weather in ${cityName}: ${weather.weather[0].description.charAt(0).toUpperCase() + weather.weather[0].description.slice(1)}. Temperature: ${Math.round(weather.main.temp)}°C (feels like ${Math.round(weather.main.feels_like)}°C). Humidity: ${weather.main.humidity}%. Wind: ${weather.wind.speed} m/s. Visibility: ${(weather.visibility / 1000).toFixed(1)} km. Pressure: ${weather.main.pressure} hPa. Last updated: ${new Date().toLocaleTimeString()}.`;
}

function determineForecastConfig(dateTime, datePeriod, queryText) {
    console.log('determineForecastConfig - dateTime:', dateTime);
    console.log('determineForecastConfig - datePeriod:', JSON.stringify(datePeriod));
    console.log('determineForecastConfig - queryText:', queryText);
    
    const hasPeriod = datePeriod && 
        (typeof datePeriod === 'string' || 
         (typeof datePeriod === 'object' && (datePeriod.startDate || datePeriod.endDate)));
    
    console.log('Has period:', hasPeriod);
    console.log('Has dateTime:', !!dateTime);
    
    if (dateTime && hasPeriod) {
        console.log('Both dateTime and datePeriod provided - treating as range');
        
        let days = 5;
        let periodText = '5-day';
        let startDate = null;
        let endDate = null;
        
        if (typeof datePeriod === 'object' && datePeriod.startDate && datePeriod.endDate) {
            startDate = datePeriod.startDate;
            endDate = datePeriod.endDate;
            
            const start = new Date(datePeriod.startDate);
            const end = new Date(datePeriod.endDate);
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            
            days = Math.min(daysDiff, 5);
            
            if (days >= 7) {
                periodText = 'weekly';
            } else {
                periodText = `${days}-day`;
            }
        }
        else if (typeof datePeriod === 'string') {
            if (datePeriod.includes('week')) {
                days = 5;
                periodText = '5-day weekly';
            } else if (datePeriod.includes('day')) {
                const match = datePeriod.match(/(\d+)\s*day/);
                if (match) {
                    days = Math.min(parseInt(match[1]), 5);
                    periodText = `${days}-day`;
                }
            }
        }
        else if (queryText) {
            if (queryText.toLowerCase().includes('week')) {
                days = 5;
                periodText = '5-day weekly';
            }
        }
        
        return {
            days,
            periodText,
            specificDate: null,
            specificInfo: null,
            wantsSpecificDay: false,
            singleDayOnly: false,
            startDate: startDate,
            endDate: endDate
        };
    }
    
    if (dateTime && !hasPeriod) {

        const query = queryText.toLowerCase();
        // Check if query indicates a range starting from a date
        const isRangeFromDate = /\b(from|starting|beginning|since)\b/.test(query) || 
                            /forecast.*from/.test(query);
        
        if (isRangeFromDate) {
            // Treat as 5-day forecast from specified date
            return {
                days: 5,
                periodText: '5-day',
                specificDate: null,
                specificInfo: null,
                wantsSpecificDay: false,
                singleDayOnly: false,
                startDate: dateTime,
                endDate: null
            };
        }
        else
        {
            console.log('Only dateTime provided - single day request');
    
            const targetDate = new Date(dateTime);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            targetDate.setHours(0, 0, 0, 0);

            const daysDiff = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));

            let dayName;
            if (daysDiff === 0) {
                dayName = 'today';
            } else if (daysDiff === 1) {
                dayName = 'tomorrow';
            } else if (daysDiff === 2) {
                dayName = 'day after tomorrow';
            } else {
                dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            }
            
            return {
                days: 1,
                periodText: dayName,
                specificDate: targetDate,
                specificInfo: null,
                wantsSpecificDay: true,
                singleDayOnly: true,
                startDate: null,
                endDate: null
            };
        }
    }
    
    if (hasPeriod && !dateTime) {
        console.log('Only datePeriod provided - range request');
        
        let days = 5;
        let periodText = '5-day';
        let startDate = null;
        let endDate = null;
        
        if (typeof datePeriod === 'string') {
            if (datePeriod.includes('week')) {
                days = 5;
                periodText = '5-day weekly';
            } else if (datePeriod.includes('day')) {
                const match = datePeriod.match(/(\d+)\s*day/);
                if (match) {
                    days = Math.min(parseInt(match[1]), 5);
                    periodText = `${days}-day`;
                }
            }
        } else if (typeof datePeriod === 'object' && datePeriod.startDate && datePeriod.endDate) {
            startDate = datePeriod.startDate;
            endDate = datePeriod.endDate;
            
            const start = new Date(datePeriod.startDate);
            const end = new Date(datePeriod.endDate);
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            
            days = Math.min(daysDiff, 5);
            if (days >= 7) {
                periodText = 'weekly';  
            } else if (days === 1) {
                periodText = 'daily';
            } else {
                periodText = `${days}-day`;
            }
        }
        
        return {
            days,
            periodText,
            specificDate: null,
            specificInfo: null,
            wantsSpecificDay: false,
            singleDayOnly: false,
            startDate: startDate,
            endDate: endDate
        };
    }
    
    console.log('No specific parameters - default forecast');
    return {
        days: 5,
        periodText: '5-day',
        specificDate: null,
        specificInfo: null,
        wantsSpecificDay: false,
        singleDayOnly: false,
        startDate: null,
        endDate: null
    };
}

function groupForecastByDay(forecastList, maxDays, startDate = null, endDate = null) {
    console.log('Grouping forecast - maxDays:', maxDays, 'startDate:', startDate, 'endDate:', endDate);
    
    const dailyData = new Map();
    let filteredList = forecastList;
    
    // Filter by date range if provided
    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        
        console.log('Filtering for range:', start.toDateString(), 'to', end.toDateString());
        
        filteredList = forecastList.filter(item => {
            const itemDate = new Date(item.dt * 1000);
            return itemDate >= start && itemDate <= end;
        });
    }
    
    // Group forecast data by day and aggregate min/max temps
    filteredList.forEach(item => {
        const itemDate = new Date(item.dt * 1000);
        const dateKey = itemDate.toDateString();
        
        if (dailyData.has(dateKey)) {
            // Update existing day data with min/max temperatures
            const existing = dailyData.get(dateKey);
            existing.main.temp_max = Math.max(existing.main.temp_max, item.main.temp_max || item.main.temp);
            existing.main.temp_min = Math.min(existing.main.temp_min, item.main.temp_min || item.main.temp);
            
            // Update other fields if this reading is closer to midday (12 PM)
            const currentHour = itemDate.getHours();
            const existingHour = new Date(existing.dt * 1000).getHours();
            
            if (Math.abs(currentHour - 12) < Math.abs(existingHour - 12)) {
                existing.weather = item.weather;
                existing.main.humidity = item.main.humidity;
                existing.wind = item.wind;
                existing.dt = item.dt;
                existing.dt_txt = item.dt_txt;
            }
        } else if (dailyData.size < maxDays) {
            // Add new day data
            dailyData.set(dateKey, {
                ...item,
                main: {
                    ...item.main,
                    temp_max: item.main.temp_max || item.main.temp,
                    temp_min: item.main.temp_min || item.main.temp
                }
            });
        }
    });
    
    console.log('Days found:', dailyData.size);
    return Array.from(dailyData.values()).slice(0, maxDays);
}

function formatForecastResponse(forecast, cityName, country, config) {
    console.log('formatForecastResponse - config:', JSON.stringify(config, null, 2));
    
    if (config.singleDayOnly && config.specificDate) {
        console.log('Single day request for:', config.specificDate);
        
        const targetDate = new Date(config.specificDate);
        const targetDateStr = targetDate.toDateString();
        
        let targetForecast = null;
        
        // Find the best forecast for the target date (preferring midday readings)
        for (const item of forecast.list) {
            const itemDate = new Date(item.dt * 1000);
            if (itemDate.toDateString() === targetDateStr) {
                if (itemDate.getHours() >= 12 && itemDate.getHours() <= 15) {
                    targetForecast = item;
                    break;
                }
                if (!targetForecast) {
                    targetForecast = item;
                }
            }
        }
        
        if (!targetForecast) {
            return `Sorry, I don't have weather data for ${config.periodText} in ${cityName}.`;
        }
        
        const description = targetForecast.weather[0].description;
        const temp = Math.round(targetForecast.main.temp);
        const feelsLike = Math.round(targetForecast.main.feels_like);
        const humidity = targetForecast.main.humidity;
        const windSpeed = targetForecast.wind.speed;
        
        return `Weather ${config.periodText} in ${cityName}, ${country}: ${description.charAt(0).toUpperCase() + description.slice(1)}, Temperature: ${temp}°C (feels like ${feelsLike}°C), Humidity: ${humidity}%, Wind: ${windSpeed} m/s.`;
    }
    
    console.log('Multi-day forecast requested');
    
    let forecastText = `${config.periodText.charAt(0).toUpperCase() + config.periodText.slice(1)} weather forecast for ${cityName}, ${country}: `;
    
    const dailyForecasts = groupForecastByDay(
        forecast.list, 
        config.days, 
        config.startDate, 
        config.endDate
    );
    
    dailyForecasts.forEach((day, index) => {
        const date = new Date(day.dt * 1000);
        const dayName = getDayName(index, date);
        
        forecastText += `${dayName}: ${day.weather[0].description}, High: ${Math.round(day.main.temp_max)}°C, Low: ${Math.round(day.main.temp_min)}°C, Humidity: ${day.main.humidity}%, Wind: ${day.wind.speed} m/s. `;
    });
    
    forecastText += `Forecast updated: ${new Date().toLocaleTimeString()}.`;
    
    return forecastText;
}

function getDayName(index, date) {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Reset hours for accurate date comparison
    const compareDate = new Date(date);
    const compareToday = new Date(today);
    const compareTomorrow = new Date(tomorrow);
    
    compareDate.setHours(0, 0, 0, 0);
    compareToday.setHours(0, 0, 0, 0);
    compareTomorrow.setHours(0, 0, 0, 0);
    
    if (compareDate.getTime() === compareToday.getTime()) {
        return 'Today';
    }
    if (compareDate.getTime() === compareTomorrow.getTime()) {
        return 'Tomorrow';
    }
    
    return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    });
}

function validateAndCleanCity(city) {
    if (!city || typeof city !== 'string' || city.trim() === '') {
        throw new Error('City name is required');
    }
    
    const cleanCity = city.trim();
    
    if (!/^[a-zA-Z\u00C0-\u017F\u4e00-\u9fff\u0400-\u04FF\s,.\-']+$/.test(cleanCity)) {
        throw new Error('Invalid city name format');
    }
    
    return cleanCity;
}



app.use((error, req, res, next) => {
    console.error('Unhandled Error:', error);
    res.status(500).json({
        fulfillmentText: "I'm experiencing technical difficulties. Please try again later."
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: ['/webhook', '/health']
    });
});

app.listen(PORT, () => {
    console.log(`Weather Bot Webhook Server Started!`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
    
    if (!OPENWEATHER_API_KEY) {
        console.warn('WARNING: OPENWEATHER_API_KEY not found in environment variables!');
    } else {
        console.log('OpenWeather API key configured');
    }
});

module.exports = app;