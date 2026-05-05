import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, LayoutAnimation, Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, Switch, Text, TextInput, UIManager, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDaysLabel, normalizeDateInput } from '@appfridge/shared';
import { AiRequestError, addInventoryItem, fetchAiRecipes, fetchInventory, lookupProduct, registerPushToken, removeInventoryItem, scanExpiryDateFromImage, scanProductNameFromImage, unregisterPushToken, updateInventoryItem } from './src/api';
import { registerForPushNotificationsAsync } from './src/notifications';
import { styles } from './src/styles';
const LOCATION_OPTIONS = [
    { value: 'fridge', label: 'Холодильник' },
    { value: 'freezer', label: 'Морозильна камера' }
];
const KUROMI_BG_IMAGE_URI = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Kuromi_clothing_and_accessories.jpg';
const KUROMI_TITLE_IMAGE_URI = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Kuromi_clothing_and_accessories.jpg';
const PUSH_ENABLED_STORAGE_KEY = '@appfridge_push_enabled';
const PUSH_TOKEN_STORAGE_KEY = '@appfridge_push_token';
function getTodayParts() {
    const now = new Date();
    return {
        day: String(now.getDate()).padStart(2, '0'),
        month: String(now.getMonth() + 1).padStart(2, '0'),
        year: String(now.getFullYear())
    };
}
function isGenericUnknownProductName(name, barcode) {
    return name.trim().toLowerCase() === `товар ${barcode}`.toLowerCase();
}
function formatLocationLabel(location) {
    if (location === 'fridge') {
        return 'Холодильник';
    }
    if (location === 'freezer') {
        return 'Морозильна камера';
    }
    return 'Комора';
}
function formatStatusLabel(status) {
    if (status === 'expired') {
        return 'Прострочено';
    }
    if (status === 'expiring') {
        return 'Скоро закінчиться';
    }
    return 'Свіжий';
}
function formatExpirationLabel(item) {
    if (item.location === 'freezer') {
        return 'Без терміну (морозилка)';
    }
    return item.expirationDate;
}
function formatShelfLifeLabel(item) {
    if (item.location === 'freezer') {
        return 'Заморожено';
    }
    return formatDaysLabel(item.insight.daysLeft);
}
function inferProductCategory(name) {
    const v = name.toLowerCase();
    if (!v.trim())
        return 'Інше';
    if (/(молок|кефір|сметан|вершк|масл|cream|milk)/i.test(v))
        return 'Молочні продукти';
    if (/(сир|cheese|gouda|моцарел|бринз|almette)/i.test(v))
        return 'Сири';
    if (/(йогур|десерт|pudding)/i.test(v))
        return 'Йогурти та десерти';
    if (/(ковбас|сосиск|салям|шинка|ham|sausage)/i.test(v))
        return 'Ковбаси';
    if (/(м.?яс|курк|індич|ялович|свинин|beef|chicken|turkey|pork)/i.test(v))
        return "М'ясо";
    if (/(риба|лосос|тунец|оселед|shrimp|fish|salmon|tuna)/i.test(v))
        return 'Риба та морепродукти';
    if (/(овоч|томат|помідор|огір|морк|картоп|цибул|перец|капуст)/i.test(v))
        return 'Овочі';
    if (/(фрукт|яблук|банан|апельсин|лимон|груш|виноград|kiwi)/i.test(v))
        return 'Фрукти';
    if (/(сік|вода|cola|fanta|sprite|чай|кава|напій|drink|juice)/i.test(v))
        return 'Напої';
    if (/(чипс|сухарик|горіш|крекер|snack)/i.test(v))
        return 'Снеки';
    if (/(шоколад|цукерк|печив|торт|вафл|цукор|dessert|cookie)/i.test(v))
        return 'Солодощі';
    if (/(заморож|морозив|pelmeni|пельмен|нагетс|frozen)/i.test(v))
        return 'Заморожені продукти';
    if (/(консерв|тунец у бан|горошок|кукурудз)/i.test(v))
        return 'Консерви';
    if (/(соус|кетчуп|майонез|гірчиц|sauce)/i.test(v))
        return 'Соуси';
    if (/(хліб|булк|батон|лаваш|bun|bread)/i.test(v))
        return 'Хліб та випічка';
    if (/(макарон|паста|рис|греч|круп|вівсян)/i.test(v))
        return 'Крупи та макарони';
    if (/(готов|сендвіч|салат|піца|суп)/i.test(v))
        return 'Готові страви';
    return 'Інше';
}
function PhotoProcessingOverlay({ visible, label, inline = false, overlayInParent = false }) {
    const door = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    const wobble = useRef(new Animated.Value(0)).current;
    const glow = useRef(new Animated.Value(0.35)).current;
    const shelfShift = useRef(new Animated.Value(0)).current;
    const snowA = useRef(new Animated.Value(0)).current;
    const snowB = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!visible) {
            door.setValue(0);
            pulse.setValue(1);
            wobble.setValue(0);
            glow.setValue(0.35);
            shelfShift.setValue(0);
            snowA.setValue(0);
            snowB.setValue(0);
            return;
        }
        const doorLoop = Animated.loop(Animated.sequence([
            Animated.timing(door, {
                toValue: 1,
                duration: 520,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(door, {
                toValue: 0,
                duration: 520,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            })
        ]));
        const pulseLoop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, {
                toValue: 1.04,
                duration: 450,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(pulse, {
                toValue: 1,
                duration: 450,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            })
        ]));
        const wobbleLoop = Animated.loop(Animated.sequence([
            Animated.timing(wobble, {
                toValue: 1,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(wobble, {
                toValue: -1,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(wobble, {
                toValue: 0,
                duration: 500,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            })
        ]));
        const glowLoop = Animated.loop(Animated.sequence([
            Animated.timing(glow, {
                toValue: 0.72,
                duration: 560,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(glow, {
                toValue: 0.35,
                duration: 560,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            })
        ]));
        const shelfLoop = Animated.loop(Animated.sequence([
            Animated.timing(shelfShift, {
                toValue: 1,
                duration: 800,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            }),
            Animated.timing(shelfShift, {
                toValue: 0,
                duration: 800,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true
            })
        ]));
        const snowLoopA = Animated.loop(Animated.timing(snowA, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
        }));
        const snowLoopB = Animated.loop(Animated.timing(snowB, {
            toValue: 1,
            duration: 1700,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true
        }));
        doorLoop.start();
        pulseLoop.start();
        wobbleLoop.start();
        glowLoop.start();
        shelfLoop.start();
        snowLoopA.start();
        snowLoopB.start();
        return () => {
            doorLoop.stop();
            pulseLoop.stop();
            wobbleLoop.stop();
            glowLoop.stop();
            shelfLoop.stop();
            snowLoopA.stop();
            snowLoopB.stop();
        };
    }, [door, pulse, wobble, glow, shelfShift, snowA, snowB, visible]);
    const doorTransform = {
        transform: [
            {
                translateX: door.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 8]
                })
            }
        ]
    };
    const fridgeWobbleStyle = {
        transform: [
            {
                rotate: wobble.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ['-3deg', '0deg', '3deg']
                })
            },
            {
                translateY: wobble.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [1, -2, 1]
                })
            }
        ]
    };
    const shelfShiftStyle = {
        transform: [
            {
                translateX: shelfShift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-4, 4]
                })
            }
        ]
    };
    const snowAStyle = {
        transform: [
            {
                translateY: snowA.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 6]
                })
            }
        ]
    };
    const snowBStyle = {
        transform: [
            {
                translateY: snowB.interpolate({
                    inputRange: [0, 1],
                    outputRange: [5, -5]
                })
            }
        ]
    };
    if (!visible) {
        return null;
    }
    if (inline) {
        return (_jsx(View, { style: overlayInParent ? styles.processingInlineOverlay : styles.processingInlineWrap, children: _jsxs(Animated.View, { style: [styles.processingCard, { transform: [{ scale: pulse }] }], children: [_jsxs(Animated.View, { style: [styles.processingFridge, fridgeWobbleStyle], children: [_jsx(Animated.View, { style: [styles.processingFridgeGlow, { opacity: glow }] }), _jsxs(View, { style: styles.processingShelfTop, children: [_jsx(Animated.View, { style: [styles.processingFoodDotA, shelfShiftStyle] }), _jsx(Animated.View, { style: [styles.processingFoodDotB, shelfShiftStyle] })] }), _jsx(View, { style: styles.processingShelfBottom, children: _jsx(Animated.View, { style: [styles.processingFoodDotC, shelfShiftStyle] }) }), _jsx(Animated.View, { style: [styles.processingFridgeDoor, doorTransform] }), _jsx(View, { style: styles.processingFridgeHandle }), _jsx(Animated.Text, { style: [styles.processingSnowA, snowAStyle], children: "\u2744\uFE0F" }), _jsx(Animated.Text, { style: [styles.processingSnowB, snowBStyle], children: "\u2744\uFE0F" })] }), _jsx(Text, { style: styles.processingTitle, children: "\u041E\u0431\u0440\u043E\u0431\u043B\u044F\u0454\u043C\u043E \u0444\u043E\u0442\u043E\u2026" }), _jsx(Text, { style: styles.processingText, children: label })] }) }));
    }
    return (_jsx(Modal, { visible: visible, transparent: true, animationType: "fade", children: _jsx(View, { style: styles.processingOverlay, children: _jsxs(Animated.View, { style: [styles.processingCard, { transform: [{ scale: pulse }] }], children: [_jsxs(Animated.View, { style: [styles.processingFridge, fridgeWobbleStyle], children: [_jsx(Animated.View, { style: [styles.processingFridgeGlow, { opacity: glow }] }), _jsxs(View, { style: styles.processingShelfTop, children: [_jsx(Animated.View, { style: [styles.processingFoodDotA, shelfShiftStyle] }), _jsx(Animated.View, { style: [styles.processingFoodDotB, shelfShiftStyle] })] }), _jsx(View, { style: styles.processingShelfBottom, children: _jsx(Animated.View, { style: [styles.processingFoodDotC, shelfShiftStyle] }) }), _jsx(Animated.View, { style: [styles.processingFridgeDoor, doorTransform] }), _jsx(View, { style: styles.processingFridgeHandle }), _jsx(Animated.Text, { style: [styles.processingSnowA, snowAStyle], children: "\u2744\uFE0F" }), _jsx(Animated.Text, { style: [styles.processingSnowB, snowBStyle], children: "\u2744\uFE0F" })] }), _jsx(Text, { style: styles.processingTitle, children: "\u041E\u0431\u0440\u043E\u0431\u043B\u044F\u0454\u043C\u043E \u0444\u043E\u0442\u043E\u2026" }), _jsx(Text, { style: styles.processingText, children: label })] }) }) }));
}
function QuantityWheel({ value, min = 1, max = 30, onChange }) {
    const itemHeight = 44;
    const values = useMemo(() => {
        const out = [];
        for (let i = min; i <= max; i += 1) {
            out.push(i);
        }
        return out;
    }, [min, max]);
    const scrollRef = useRef(null);
    useEffect(() => {
        const clamped = Math.min(max, Math.max(min, value));
        const index = clamped - min;
        const timer = setTimeout(() => {
            scrollRef.current?.scrollTo({ y: index * itemHeight, animated: false });
        }, 0);
        return () => clearTimeout(timer);
    }, [itemHeight, max, min, value]);
    function applyFromOffset(offsetY) {
        const rawIndex = Math.round(offsetY / itemHeight);
        const safeIndex = Math.max(0, Math.min(values.length - 1, rawIndex));
        const next = values[safeIndex];
        if (next !== value) {
            onChange(next);
        }
        scrollRef.current?.scrollTo({ y: safeIndex * itemHeight, animated: true });
    }
    return (_jsxs(View, { style: styles.qtyWheelWrap, children: [_jsx(View, { pointerEvents: "none", style: styles.qtyWheelCenterBand }), _jsx(ScrollView, { ref: scrollRef, style: styles.qtyWheelScroll, contentContainerStyle: styles.qtyWheelContent, showsVerticalScrollIndicator: false, snapToInterval: itemHeight, decelerationRate: "fast", onMomentumScrollEnd: (e) => applyFromOffset(e.nativeEvent.contentOffset.y), children: values.map((num) => (_jsx(View, { style: styles.qtyWheelItem, children: _jsx(Text, { style: [styles.qtyWheelText, num === value ? styles.qtyWheelTextActive : undefined], children: num }) }, num))) })] }));
}
function InventoryTile({ item, aiSelected, onOpen, onToggleAi, onSwipeMove, onSwipeDelete, onSwipeActiveChange }) {
    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;
    const activeAxisRef = useRef('none');
    const SWIPE_DISTANCE_THRESHOLD = 34;
    const SWIPE_VELOCITY_THRESHOLD = 0.22;
    const SWIPE_DELETE_DISTANCE_THRESHOLD = 58;
    const SWIPE_DELETE_VELOCITY_THRESHOLD = 0.34;
    const statusBorderStyle = item.insight.status === 'expired' ? styles.cardDanger : item.insight.status === 'expiring' ? styles.cardWarn : styles.cardFresh;
    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gesture) => {
            const ax = Math.abs(gesture.dx);
            const ay = Math.abs(gesture.dy);
            const horizontal = ax > 6 && ax > ay + 2;
            const upward = gesture.dy < -10 && ay > ax + 2;
            return horizontal || upward;
        },
        onMoveShouldSetPanResponderCapture: (_evt, gesture) => {
            const ax = Math.abs(gesture.dx);
            const ay = Math.abs(gesture.dy);
            const horizontal = ax > 6 && ax > ay + 2;
            const upward = gesture.dy < -10 && ay > ax + 2;
            return horizontal || upward;
        },
        onPanResponderGrant: () => {
            activeAxisRef.current = 'none';
            onSwipeActiveChange(true);
        },
        onPanResponderMove: (_evt, gesture) => {
            const ax = Math.abs(gesture.dx);
            const ay = Math.abs(gesture.dy);
            if (activeAxisRef.current === 'none' && (ax > 6 || ay > 6)) {
                activeAxisRef.current = ay > ax + 2 ? 'y' : 'x';
            }
            if (activeAxisRef.current === 'y') {
                const dampedDy = Math.max(-92, Math.min(10, gesture.dy * 0.66));
                translateX.setValue(0);
                translateY.setValue(dampedDy);
                return;
            }
            const dampedDx = Math.max(-90, Math.min(90, gesture.dx * 0.74));
            translateX.setValue(dampedDx);
            translateY.setValue(0);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderRelease: (_evt, gesture) => {
            const rightSwipeStrong = gesture.dx > SWIPE_DISTANCE_THRESHOLD || (gesture.dx > 18 && gesture.vx > SWIPE_VELOCITY_THRESHOLD);
            const leftSwipeStrong = gesture.dx < -SWIPE_DISTANCE_THRESHOLD || (gesture.dx < -18 && gesture.vx < -SWIPE_VELOCITY_THRESHOLD);
            const upSwipeStrong = gesture.dy < -SWIPE_DELETE_DISTANCE_THRESHOLD || (gesture.dy < -22 && gesture.vy < -SWIPE_DELETE_VELOCITY_THRESHOLD);
            const canMoveToFreezer = item.location === 'fridge' && rightSwipeStrong;
            const canMoveToFridge = item.location === 'freezer' && leftSwipeStrong;
            const canDelete = upSwipeStrong && (activeAxisRef.current === 'y' || Math.abs(gesture.dy) > Math.abs(gesture.dx) + 4);
            const target = canMoveToFreezer ? 'freezer' : canMoveToFridge ? 'fridge' : null;
            if (canDelete) {
                Animated.parallel([
                    Animated.timing(translateY, {
                        toValue: -160,
                        duration: 260,
                        easing: Easing.bezier(0.16, 1, 0.3, 1),
                        useNativeDriver: true
                    }),
                    Animated.timing(translateX, {
                        toValue: 0,
                        duration: 180,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: true
                    })
                ]).start(() => {
                    translateX.setValue(0);
                    translateY.setValue(0);
                    activeAxisRef.current = 'none';
                    onSwipeActiveChange(false);
                    onSwipeDelete(item.id);
                });
                return;
            }
            if (target) {
                const flingTo = target === 'freezer' ? 120 : -120;
                Animated.parallel([
                    Animated.timing(translateX, {
                        toValue: flingTo,
                        duration: 320,
                        easing: Easing.bezier(0.16, 1, 0.3, 1),
                        useNativeDriver: true
                    }),
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        damping: 28,
                        stiffness: 110,
                        mass: 1.15
                    })
                ]).start(() => {
                    translateX.setValue(0);
                    translateY.setValue(0);
                    activeAxisRef.current = 'none';
                    onSwipeActiveChange(false);
                    onSwipeMove(item, target);
                });
                return;
            }
            onSwipeActiveChange(false);
            Animated.parallel([
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 28,
                    stiffness: 110,
                    mass: 1.15
                }),
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 28,
                    stiffness: 110,
                    mass: 1.15
                })
            ]).start(() => {
                activeAxisRef.current = 'none';
            });
        },
        onPanResponderTerminate: () => {
            onSwipeActiveChange(false);
            Animated.parallel([
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 28,
                    stiffness: 110,
                    mass: 1.15
                }),
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 28,
                    stiffness: 110,
                    mass: 1.15
                })
            ]).start(() => {
                activeAxisRef.current = 'none';
            });
        }
    }), [item, onSwipeActiveChange, onSwipeDelete, onSwipeMove, translateX, translateY]);
    return (_jsxs(Animated.View, { ...panResponder.panHandlers, style: [
            styles.inventoryTile,
            statusBorderStyle,
            { transform: [{ translateX }, { translateY }] }
        ], children: [_jsxs(Pressable, { style: styles.inventoryTileTop, onPress: () => onOpen(item), children: [_jsx(Text, { numberOfLines: 2, style: styles.inventoryTileTitle, children: item.name }), _jsxs(Text, { style: styles.inventoryTileMeta, children: [item.quantity, " \u0448\u0442."] }), _jsx(Text, { style: styles.inventoryTileMeta, children: formatExpirationLabel(item) }), _jsx(Text, { style: styles.inventoryTileStatus, children: formatShelfLifeLabel(item) }), _jsxs(Text, { style: styles.inventoryDragHint, children: [item.location === 'fridge' ? 'Свайп вправо → у морозилку' : 'Свайп вліво → у холодильник', " \u2022 \u0421\u0432\u0430\u0439\u043F \u0432\u0433\u043E\u0440\u0443 \u2192 \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438"] }), aiSelected ? _jsx(Text, { style: styles.inventoryTileAiTag, children: "\u0412 AI" }) : null] }), _jsx(Pressable, { style: [styles.inventoryTileAiButton, aiSelected ? styles.inventoryTileAiButtonActive : undefined], onPress: () => onToggleAi(item.id), children: _jsx(Text, { style: styles.inventoryTileAiButtonText, children: aiSelected ? 'В AI' : 'Додати в AI' }) })] }));
}
const MemoInventoryTile = memo(InventoryTile, (prev, next) => prev.aiSelected === next.aiSelected &&
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.quantity === next.item.quantity &&
    prev.item.location === next.item.location &&
    prev.item.expirationDate === next.item.expirationDate &&
    prev.item.insight.status === next.item.insight.status &&
    prev.item.insight.daysLeft === next.item.insight.daysLeft);
export default function App() {
    const todayDefaults = useMemo(() => getTodayParts(), []);
    const [inventory, setInventory] = useState([]);
    const [barcode, setBarcode] = useState('');
    const [productName, setProductName] = useState('');
    const [productCategory, setProductCategory] = useState('');
    const [productNote, setProductNote] = useState('');
    const [expirationDay, setExpirationDay] = useState(todayDefaults.day);
    const [expirationMonth, setExpirationMonth] = useState(todayDefaults.month);
    const [expirationYear, setExpirationYear] = useState(todayDefaults.year);
    const [quantity, setQuantity] = useState('1');
    const [location, setLocation] = useState('fridge');
    const [scanning, setScanning] = useState(false);
    const [expiryCameraOpen, setExpiryCameraOpen] = useState(false);
    const [expiryCaptureBusy, setExpiryCaptureBusy] = useState(false);
    const [manualProductModalOpen, setManualProductModalOpen] = useState(false);
    const [manualDateModalOpen, setManualDateModalOpen] = useState(false);
    const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
    const [lastDateStepSource, setLastDateStepSource] = useState('camera');
    const [nameCameraOpen, setNameCameraOpen] = useState(false);
    const [nameCaptureBusy, setNameCaptureBusy] = useState(false);
    const [resumeManualProductAfterNameScan, setResumeManualProductAfterNameScan] = useState(false);
    const [manualProductName, setManualProductName] = useState('');
    const [manualProductQuantity, setManualProductQuantity] = useState('1');
    const [manualProductCategory, setManualProductCategory] = useState('');
    const [loading, setLoading] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const [aiRecipes, setAiRecipes] = useState([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSelectedItemIds, setAiSelectedItemIds] = useState([]);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);
    const [aiNotice, setAiNotice] = useState('Порада: додайте 2-3 продукти зі строком до 7 днів, тоді AI дає найкращі рецепти.');
    const [aiNoticeTone, setAiNoticeTone] = useState('neutral');
    const [swipeLock, setSwipeLock] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(true);
    const [pushSettingReady, setPushSettingReady] = useState(false);
    const inventoryLoadInFlightRef = useRef(false);
    /** Ігноруємо відповіді застарілих паралельних lookup (подвійний скан / «Знайти» під час запиту). */
    const lookupGenerationRef = useRef(0);
    /** Один акт прийняття з камери: до відкриття сканера знову — блокуємо повторні onBarcodeScanned у тому ж кадрі. */
    const scanConsumedRef = useRef(false);
    const expiryCameraRef = useRef(null);
    const nameCameraRef = useRef(null);
    const animateListTransition = () => {
        LayoutAnimation.configureNext({
            duration: 420,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.spring, springDamping: 0.92 },
            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }
        });
    };
    useEffect(() => {
        loadInventory();
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }, []);
    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(PUSH_ENABLED_STORAGE_KEY);
                setPushEnabled(raw == null ? true : raw === '1');
            }
            finally {
                setPushSettingReady(true);
            }
        })();
    }, []);
    useEffect(() => {
        if (!pushSettingReady || !pushEnabled) {
            return;
        }
        void registerPushNotifications(false);
    }, [pushEnabled, pushSettingReady]);
    useEffect(() => {
        setAiSelectedItemIds((current) => {
            const existing = new Set(inventory.map((item) => item.id));
            return current.filter((id) => existing.has(id));
        });
        setSelectedInventoryItem((current) => {
            if (!current) {
                return null;
            }
            const latest = inventory.find((item) => item.id === current.id);
            return latest ?? null;
        });
    }, [inventory]);
    async function registerPushNotifications(showAlerts = true) {
        const result = await registerForPushNotificationsAsync();
        if (!result.ok) {
            if (!showAlerts) {
                return;
            }
            const message = result.reason === 'permission_denied'
                ? 'Дозвольте сповіщення в Налаштуваннях iOS: Settings -> Notifications -> AppFridge.'
                : result.reason === 'missing_project_id'
                    ? 'Не задано EAS projectId. Додайте EXPO_PUBLIC_EAS_PROJECT_ID у apps/mobile/.env і перезапустіть Expo.'
                    : result.message ?? 'Push не налаштовано.';
            Alert.alert('Push не підключено', message);
            return;
        }
        try {
            await registerPushToken(result.registration);
            await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, result.registration.token);
            if (showAlerts) {
                Alert.alert('Push підключено', 'Сповіщення успішно увімкнено на цьому пристрої.');
            }
        }
        catch {
            if (showAlerts) {
                Alert.alert('Push не збережено', 'Не вдалося передати токен на сервер. Перевірте backend і EXPO_PUBLIC_API_URL.');
            }
        }
    }
    async function handleTogglePush(next) {
        setPushEnabled(next);
        await AsyncStorage.setItem(PUSH_ENABLED_STORAGE_KEY, next ? '1' : '0');
        if (next) {
            await registerPushNotifications(true);
            return;
        }
        try {
            const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
            if (token) {
                await unregisterPushToken(token);
            }
            await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
            Alert.alert('Push вимкнено', 'Сповіщення відключено для цього пристрою.');
        }
        catch {
            Alert.alert('Помилка', 'Не вдалося вимкнути push на сервері.');
        }
    }
    async function loadInventory() {
        if (inventoryLoadInFlightRef.current) {
            return;
        }
        inventoryLoadInFlightRef.current = true;
        try {
            const items = await fetchInventory();
            setInventory(items);
        }
        catch {
            Alert.alert('Бекенд недоступний', 'Запустіть сервер перед перевіркою мобільного застосунку.');
        }
        finally {
            inventoryLoadInFlightRef.current = false;
        }
    }
    async function handleLookup(targetBarcode) {
        const code = (targetBarcode ?? barcode).trim();
        if (!code) {
            return;
        }
        const generation = ++lookupGenerationRef.current;
        setLoading(true);
        setBarcode(code);
        try {
            const product = await lookupProduct(code);
            if (generation !== lookupGenerationRef.current) {
                return;
            }
            const resolvedName = isGenericUnknownProductName(product.name, code) ? '' : product.name;
            setProductName(resolvedName);
            setProductCategory(product.category ?? '');
            setProductNote(product.note?.trim() ? product.note : '');
            if (product.lookupStatus === 'catalog') {
                setQuantity('1');
                setManualProductModalOpen(false);
                void requestExpiryCamera();
                return;
            }
            setManualProductName(resolvedName);
            setManualProductQuantity('1');
            setManualProductCategory(product.category ?? inferProductCategory(resolvedName));
            setManualProductModalOpen(true);
        }
        catch {
            if (generation !== lookupGenerationRef.current) {
                return;
            }
            setProductName('');
            setProductCategory('');
            setProductNote('');
            setManualProductName('');
            setManualProductQuantity('1');
            setManualProductCategory('Інше');
            setManualProductModalOpen(true);
        }
        finally {
            if (generation === lookupGenerationRef.current) {
                setLoading(false);
            }
        }
    }
    async function requestScanner() {
        scanConsumedRef.current = false;
        if (!permission?.granted) {
            const result = await requestPermission();
            setScanning(result.granted);
            return;
        }
        setScanning(true);
    }
    async function requestExpiryCamera() {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                return;
            }
        }
        setExpiryCameraOpen(true);
    }
    async function requestNameCamera() {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                return;
            }
        }
        setResumeManualProductAfterNameScan(true);
        setManualProductModalOpen(false);
        setTimeout(() => {
            setNameCameraOpen(true);
        }, 60);
    }
    function closeNameCameraAndReturn() {
        setNameCameraOpen(false);
        if (resumeManualProductAfterNameScan) {
            setTimeout(() => {
                setManualProductModalOpen(true);
            }, 60);
        }
        setResumeManualProductAfterNameScan(false);
    }
    function confirmManualProductEntry() {
        const name = manualProductName.trim();
        if (!name) {
            Alert.alert('Назва потрібна', 'Введіть назву продукту.');
            return;
        }
        const nextQty = Math.max(1, Number(manualProductQuantity) || 1);
        const autoCategory = manualProductCategory || inferProductCategory(name);
        setProductName(name);
        setProductCategory(autoCategory);
        setQuantity(String(nextQty));
        setManualProductModalOpen(false);
        void requestExpiryCamera();
    }
    function applyExpiryDateAndOpenFinalize(day, month, year, source) {
        setExpirationDay(String(day).padStart(2, '0'));
        setExpirationMonth(String(month).padStart(2, '0'));
        setExpirationYear(String(year));
        setLastDateStepSource(source);
        setExpiryCameraOpen(false);
        setManualDateModalOpen(false);
        setFinalizeModalOpen(true);
    }
    function confirmManualDateEntry() {
        const yyyy = expirationYear.replace(/\D/g, '').slice(0, 4);
        const mm = expirationMonth.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
        const dd = expirationDay.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
        const normalized = normalizeDateInput(`${yyyy}-${mm}-${dd}`);
        if (!normalized) {
            Alert.alert('Невірна дата', 'Введіть коректні день/місяць/рік.');
            return;
        }
        const [y, m, d] = normalized.split('-').map((x) => Number(x));
        applyExpiryDateAndOpenFinalize(d, m, y, 'manual');
    }
    async function captureExpiryFromPhoto() {
        if (!expiryCameraRef.current || expiryCaptureBusy) {
            return;
        }
        setExpiryCaptureBusy(true);
        try {
            const photo = await expiryCameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.65,
                skipProcessing: false
            });
            const base64 = photo.base64?.trim();
            if (!base64) {
                Alert.alert('Фото не зчитано', 'Не вдалося отримати фото. Спробуйте ще раз.');
                return;
            }
            const parsed = await scanExpiryDateFromImage({
                imageBase64: base64,
                mimeType: 'image/jpeg'
            });
            applyExpiryDateAndOpenFinalize(parsed.day, parsed.month, parsed.year, 'camera');
        }
        catch (error) {
            if (error instanceof AiRequestError) {
                Alert.alert('Не вдалося розпізнати дату', error.message);
            }
            else {
                Alert.alert('Помилка', 'Не вдалося обробити фото. Спробуйте ще раз.');
            }
        }
        finally {
            setExpiryCaptureBusy(false);
        }
    }
    async function captureProductNameFromPhoto() {
        if (!nameCameraRef.current || nameCaptureBusy) {
            return;
        }
        setNameCaptureBusy(true);
        try {
            const photo = await nameCameraRef.current.takePictureAsync({
                base64: true,
                quality: 0.65,
                skipProcessing: false
            });
            const base64 = photo.base64?.trim();
            if (!base64) {
                Alert.alert('Фото не зчитано', 'Не вдалося отримати фото. Спробуйте ще раз.');
                return;
            }
            const parsed = await scanProductNameFromImage({
                imageBase64: base64,
                mimeType: 'image/jpeg'
            });
            setManualProductName(parsed.name);
            setProductName(parsed.name);
            const autoCategory = inferProductCategory(parsed.name);
            setManualProductCategory(autoCategory);
            setProductCategory(autoCategory);
            closeNameCameraAndReturn();
            Alert.alert('Готово', `Назва розпізнана: ${parsed.name}`);
        }
        catch (error) {
            if (error instanceof AiRequestError) {
                Alert.alert('Не вдалося розпізнати назву', error.message);
            }
            else {
                Alert.alert('Помилка', 'Не вдалося обробити фото. Спробуйте ще раз.');
            }
        }
        finally {
            setNameCaptureBusy(false);
        }
    }
    async function handleAddItem() {
        if (!barcode || !productName || !expirationDay.trim() || !expirationMonth.trim() || !expirationYear.trim()) {
            Alert.alert('Не вистачає даних', 'Потрібні штрихкод, назва і дата закінчення терміну придатності.');
            return;
        }
        const yyyy = expirationYear.replace(/\D/g, '').slice(0, 4);
        const mm = expirationMonth.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
        const dd = expirationDay.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
        const fullExpirationDate = `${yyyy}-${mm}-${dd}`;
        const normalizedExpirationDate = normalizeDateInput(fullExpirationDate);
        if (!normalizedExpirationDate) {
            Alert.alert('Невірна дата', 'Перевірте день, місяць і рік (наприклад 2026-05-09).');
            return;
        }
        try {
            const created = await addInventoryItem({
                barcode,
                name: productName,
                expirationDate: normalizedExpirationDate,
                quantity: Math.max(1, Number(quantity) || 1),
                location,
                ...(productCategory ? { category: productCategory } : {}),
                ...(productNote.trim() ? { note: productNote.trim() } : {})
            });
            setInventory((current) => [created, ...current]);
            setBarcode('');
            setProductName('');
            setProductCategory('');
            setProductNote('');
            setExpirationDay(todayDefaults.day);
            setExpirationMonth(todayDefaults.month);
            setExpirationYear(todayDefaults.year);
            setQuantity('1');
            setLocation('fridge');
            setFinalizeModalOpen(false);
            setManualDateModalOpen(false);
            setManualProductModalOpen(false);
            setManualProductCategory('');
        }
        catch {
            Alert.alert('Помилка', 'Не вдалося додати продукт у бекенд.');
        }
    }
    async function handleDeleteItem(id) {
        try {
            await removeInventoryItem(id);
            animateListTransition();
            setInventory((current) => current.filter((item) => item.id !== id));
            setSelectedInventoryItem((current) => (current?.id === id ? null : current));
        }
        catch {
            Alert.alert('Помилка', 'Не вдалося видалити продукт.');
        }
    }
    function backFromManualProductStep() {
        setManualProductModalOpen(false);
        void requestScanner();
    }
    function backFromManualDateStep() {
        setManualDateModalOpen(false);
        setTimeout(() => {
            setExpiryCameraOpen(true);
        }, 60);
    }
    function backFromFinalizeStep() {
        setFinalizeModalOpen(false);
        if (lastDateStepSource === 'manual') {
            setTimeout(() => {
                setManualDateModalOpen(true);
            }, 60);
            return;
        }
        setTimeout(() => {
            setExpiryCameraOpen(true);
        }, 60);
    }
    function requestDeleteItem(id) {
        const name = inventory.find((item) => item.id === id)?.name;
        Alert.alert('Підтвердьте видалення', name ? `Видалити продукт "${name}"?` : 'Видалити цей продукт?', [
            { text: 'Скасувати', style: 'cancel' },
            {
                text: 'Видалити',
                style: 'destructive',
                onPress: () => {
                    void handleDeleteItem(id);
                }
            }
        ]);
    }
    function toggleAiItemSelection(id) {
        setAiSelectedItemIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    }
    async function patchItem(id, patch, options) {
        const prevItem = inventory.find((item) => item.id === id);
        if (!prevItem) {
            return;
        }
        const optimistic = options?.optimistic ?? true;
        const optimisticItem = {
            ...prevItem,
            ...(patch.location ? { location: patch.location } : {})
        };
        if (optimistic) {
            animateListTransition();
            setInventory((current) => current.map((item) => (item.id === id ? optimisticItem : item)));
        }
        try {
            const { item: updated, mergedRemovedId } = await updateInventoryItem(id, patch);
            animateListTransition();
            setInventory((current) => {
                const mapped = current.map((item) => (item.id === id ? updated : item));
                if (!mergedRemovedId) {
                    return mapped;
                }
                return mapped.filter((item) => item.id !== mergedRemovedId);
            });
        }
        catch {
            if (optimistic) {
                animateListTransition();
                setInventory((current) => current.map((item) => (item.id === id ? prevItem : item)));
            }
            Alert.alert('Помилка', 'Не вдалося оновити продукт.');
        }
    }
    async function handleMove(item, to) {
        const target = to ?? (item.location === 'fridge' ? 'freezer' : 'fridge');
        await patchItem(item.id, { location: target }, { optimistic: true });
    }
    async function handleAiRecipes() {
        if (inventory.length === 0) {
            setAiNotice('Спочатку додайте хоча б один продукт у холодильник, а потім запитуйте AI-рецепти.');
            setAiNoticeTone('error');
            setAiRecipes([]);
            return;
        }
        setAiLoading(true);
        setAiNotice('Генеруємо AI-рецепти...');
        setAiNoticeTone('neutral');
        try {
            const next = await fetchAiRecipes(aiSelectedItemIds);
            setAiRecipes(next);
            setAiSelectedItemIds([]);
            if (next.length === 0) {
                setAiNotice('AI не повернув рецептів. Спробуйте додати більше продуктів або уточнити дати придатності.');
                setAiNoticeTone('neutral');
            }
            else {
                setAiNotice(`Готово: отримано ${next.length} AI-рецепт(и).`);
                setAiNoticeTone('ok');
            }
        }
        catch (e) {
            if (e instanceof AiRequestError) {
                if (e.code === 'ai_invalid_key') {
                    setAiNotice('AI ключ недійсний. Замініть OPENAI_API_KEY у apps/server/.env та перезапустіть сервер.');
                    setAiNoticeTone('error');
                    return;
                }
                if (e.code === 'ai_unconfigured') {
                    setAiNotice('AI не налаштовано: додайте OPENAI_API_KEY у apps/server/.env і перезапустіть сервер.');
                    setAiNoticeTone('error');
                    return;
                }
                if (e.code === 'ai_rate_limited') {
                    setAiNotice('Ліміт запитів AI перевищено. Зачекайте хвилину і спробуйте ще раз.');
                    setAiNoticeTone('error');
                    return;
                }
                if (e.code === 'ai_service_unavailable') {
                    setAiNotice('AI сервіс тимчасово недоступний. Спробуйте трохи пізніше.');
                    setAiNoticeTone('error');
                    return;
                }
                setAiNotice(e.message || 'Не вдалося отримати AI-рецепти.');
                setAiNoticeTone('error');
                return;
            }
            setAiNotice('Невідома помилка AI. Спробуйте ще раз.');
            setAiNoticeTone('error');
        }
        finally {
            setAiLoading(false);
        }
    }
    const summary = useMemo(() => {
        return inventory.reduce((acc, item) => {
            acc.total += 1;
            if (item.insight.status === 'expiring') {
                acc.expiring += 1;
            }
            if (item.insight.status === 'expired') {
                acc.expired += 1;
            }
            return acc;
        }, { total: 0, expiring: 0, expired: 0 });
    }, [inventory]);
    const fridgeItems = useMemo(() => inventory.filter((item) => item.location === 'fridge'), [inventory]);
    const freezerItems = useMemo(() => inventory.filter((item) => item.location === 'freezer'), [inventory]);
    return (_jsxs(SafeAreaView, { style: styles.screen, children: [_jsx(Image, { source: { uri: KUROMI_BG_IMAGE_URI }, resizeMode: "cover", style: styles.kuromiBackdropImage }), _jsx(View, { pointerEvents: "none", style: styles.kuromiBackdropOverlay }), _jsxs(View, { pointerEvents: "none", style: styles.kuromiDecorWrap, children: [_jsx(Text, { style: styles.kuromiDecorTop, children: "\u2620\uFE0F\uD83D\uDDA4\u2728" }), _jsx(Text, { style: styles.kuromiDecorBottom, children: "KUROMI VIBE" })] }), _jsx(StatusBar, { style: "light" }), _jsxs(ScrollView, { contentContainerStyle: styles.content, scrollEnabled: !swipeLock, children: [_jsxs(View, { style: styles.hero, children: [_jsxs(View, { style: styles.heroHeaderRow, children: [_jsx(Image, { source: { uri: KUROMI_TITLE_IMAGE_URI }, resizeMode: "cover", style: styles.heroBadgeImage }), _jsxs(View, { style: styles.heroHeaderTexts, children: [_jsx(Text, { style: styles.eyebrow, children: "AppFridge" }), _jsx(Text, { style: styles.title, children: "\u0420\u043E\u0437\u0443\u043C\u043D\u0438\u0439 \u0445\u043E\u043B\u043E\u0434\u0438\u043B\u044C\u043D\u0438\u043A \u0437\u0430 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u043E\u043C" })] })] }), _jsx(Text, { style: styles.subtitle, children: "\u0417\u0432\u0438\u0447\u0430\u0439\u043D\u0438\u0439 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u0437\u0430\u0437\u0432\u0438\u0447\u0430\u0439 \u0432\u0438\u0437\u043D\u0430\u0447\u0430\u0454 \u0441\u0430\u043C \u0442\u043E\u0432\u0430\u0440, \u0430\u043B\u0435 \u043D\u0435 \u043C\u0456\u0441\u0442\u0438\u0442\u044C \u0434\u0430\u0442\u0443 \u043F\u0440\u0438\u0434\u0430\u0442\u043D\u043E\u0441\u0442\u0456. \u0422\u043E\u043C\u0443 \u0434\u0430\u0442\u0443 \u0432\u0438 \u0432\u0432\u043E\u0434\u0438\u0442\u0435 \u0432\u0440\u0443\u0447\u043D\u0443, \u0430 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043E\u043A \u0441\u0442\u0435\u0436\u0438\u0442\u044C \u0437\u0430 \u0441\u0442\u0440\u043E\u043A\u0430\u043C\u0438 \u0442\u0430 \u043D\u0430\u0434\u0441\u0438\u043B\u0430\u0454 \u043D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F." }), _jsxs(View, { style: styles.statRow, children: [_jsxs(View, { style: styles.statCard, children: [_jsx(Text, { style: styles.statLabel, children: "\u0423\u0441\u044C\u043E\u0433\u043E" }), _jsx(Text, { style: styles.statValue, children: summary.total })] }), _jsxs(View, { style: styles.statCard, children: [_jsx(Text, { style: styles.statLabel, children: "\u0421\u043A\u043E\u0440\u043E" }), _jsx(Text, { style: styles.statValue, children: summary.expiring })] }), _jsxs(View, { style: styles.statCard, children: [_jsx(Text, { style: styles.statLabel, children: "\u041F\u0440\u043E\u0441\u0442\u0440\u043E\u0447\u0435\u043D\u043E" }), _jsx(Text, { style: styles.statValue, children: summary.expired })] })] })] }), _jsxs(View, { style: styles.section, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u0414\u043E\u0434\u0430\u0442\u0438 \u043F\u0440\u043E\u0434\u0443\u043A\u0442" }), _jsx(Text, { style: styles.sectionText, children: "\u041E\u0434\u0438\u043D \u043F\u043E\u0442\u0456\u043A: \u0441\u043A\u0430\u043D\u0443\u0454\u0442\u0435 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u2192 \u044F\u043A\u0449\u043E \u0442\u043E\u0432\u0430\u0440 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E, \u043E\u0434\u0440\u0430\u0437\u0443 \u0444\u043E\u0442\u043E \u0434\u0430\u0442\u0438; \u044F\u043A\u0449\u043E \u043D\u0456, \u0432\u0432\u043E\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0443 \u0442\u0430 \u043A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C \u2192 \u0444\u043E\u0442\u043E \u0434\u0430\u0442\u0438 \u2192 \u0432\u0438\u0431\u0456\u0440 \u043C\u0456\u0441\u0446\u044F \u2192 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043D\u044F." }), _jsx(Pressable, { style: styles.button, onPress: requestScanner, children: _jsx(Text, { style: styles.buttonText, children: "\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0441\u043A\u0430\u043D\u0435\u0440" }) })] }), _jsxs(View, { style: styles.section, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u0438" }), _jsxs(View, { style: styles.settingRow, children: [_jsxs(View, { style: styles.settingTextWrap, children: [_jsx(Text, { style: styles.settingTitle, children: "Push \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F" }), _jsx(Text, { style: styles.settingHint, children: pushEnabled ? 'Отримувати нагадування про строки придатності.' : 'Push вимкнено на цьому пристрої.' })] }), _jsx(Switch, { value: pushEnabled, onValueChange: (next) => void handleTogglePush(next), trackColor: { false: '#5b3a8a', true: '#c084fc' }, thumbColor: pushEnabled ? '#7e22ce' : '#ded2f5' })] })] }), _jsxs(View, { style: styles.section, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u041F\u0440\u043E\u0434\u0443\u043A\u0442\u0438" }), _jsx(Text, { style: styles.sectionText, children: "\u041F\u043E\u0437\u0438\u0446\u0456\u0457 \u0440\u043E\u0437\u0434\u0456\u043B\u0435\u043D\u0456 \u0437\u0430 \u043C\u0456\u0441\u0446\u0435\u043C \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u043D\u043D\u044F." }), _jsxs(View, { children: [_jsxs(View, { style: styles.inventoryGroupHeader, children: [_jsx(View, { style: [styles.inventoryGroupPill, styles.inventoryGroupPillFridge], children: _jsx(Text, { style: styles.inventoryGroupPillText, children: "\u0425\u043E\u043B\u043E\u0434\u0438\u043B\u044C\u043D\u0438\u043A" }) }), _jsx(Text, { style: styles.inventoryGroupCount, children: fridgeItems.length })] }), fridgeItems.length === 0 ? _jsx(Text, { style: styles.inventoryGroupEmpty, children: "\u041F\u043E\u043A\u0438 \u0449\u043E \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E." }) : null, _jsx(View, { style: styles.inventoryGrid, children: fridgeItems.map((item) => (_jsx(MemoInventoryTile, { item: item, aiSelected: aiSelectedItemIds.includes(item.id), onOpen: setSelectedInventoryItem, onToggleAi: toggleAiItemSelection, onSwipeMove: (x, to) => void handleMove(x, to), onSwipeDelete: requestDeleteItem, onSwipeActiveChange: setSwipeLock }, item.id))) })] }), _jsxs(View, { children: [_jsxs(View, { style: styles.inventoryGroupHeader, children: [_jsx(View, { style: [styles.inventoryGroupPill, styles.inventoryGroupPillFreezer], children: _jsx(Text, { style: styles.inventoryGroupPillText, children: "\u041C\u043E\u0440\u043E\u0437\u0438\u043B\u044C\u043D\u0430 \u043A\u0430\u043C\u0435\u0440\u0430" }) }), _jsx(Text, { style: styles.inventoryGroupCount, children: freezerItems.length })] }), freezerItems.length === 0 ? _jsx(Text, { style: styles.inventoryGroupEmpty, children: "\u041F\u043E\u043A\u0438 \u0449\u043E \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E." }) : null, _jsx(View, { style: styles.inventoryGrid, children: freezerItems.map((item) => (_jsx(MemoInventoryTile, { item: item, aiSelected: aiSelectedItemIds.includes(item.id), onOpen: setSelectedInventoryItem, onToggleAi: toggleAiItemSelection, onSwipeMove: (x, to) => void handleMove(x, to), onSwipeDelete: requestDeleteItem, onSwipeActiveChange: setSwipeLock }, item.id))) })] })] }), _jsxs(View, { style: styles.section, children: [_jsx(Text, { style: styles.sectionTitle, children: "AI \u043F\u043E\u043C\u0456\u0447\u043D\u0438\u043A" }), _jsx(Text, { style: styles.sectionText, children: "\u0413\u0435\u043D\u0435\u0440\u0443\u0454 1-3 \u0440\u0435\u0446\u0435\u043F\u0442\u0438 \u0437 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0456\u0432, \u0443 \u044F\u043A\u0438\u0445 \u0442\u0435\u0440\u043C\u0456\u043D \u043D\u0430\u0439\u043A\u0440\u0438\u0442\u0438\u0447\u043D\u0456\u0448\u0438\u0439. \u042F\u043A\u0449\u043E \u043A\u043B\u044E\u0447 \u043D\u0435\u0432\u0430\u043B\u0456\u0434\u043D\u0438\u0439 \u0430\u0431\u043E \u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439, \u043F\u0456\u0434\u043A\u0430\u0437\u043A\u0430 \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043D\u0438\u0436\u0447\u0435 \u0431\u0435\u0437 \u0441\u043F\u043B\u0438\u0432\u0430\u044E\u0447\u0438\u0445 \u043F\u043E\u043C\u0438\u043B\u043E\u043A." }), _jsx(Text, { style: styles.aiSelectionText, children: aiSelectedItemIds.length > 0
                                    ? `Вибрано ${aiSelectedItemIds.length} продукт(и) для AI.`
                                    : 'Якщо нічого не вибрано, AI використає весь список продуктів.' }), aiSelectedItemIds.length > 0 ? (_jsx(Pressable, { style: styles.aiClearButton, onPress: () => setAiSelectedItemIds([]), children: _jsx(Text, { style: styles.aiClearButtonText, children: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u0432\u0438\u0431\u0456\u0440" }) })) : null, _jsx(Pressable, { style: [styles.button, styles.buttonSecondary], onPress: () => void handleAiRecipes(), disabled: aiLoading, children: _jsx(Text, { style: styles.buttonTextLight, children: aiLoading ? 'Генеруємо…' : 'Отримати AI-рецепти' }) }), _jsx(Text, { style: [
                                    styles.aiNotice,
                                    aiNoticeTone === 'error' ? styles.aiNoticeError : undefined,
                                    aiNoticeTone === 'ok' ? styles.aiNoticeOk : undefined
                                ], children: aiNotice }), aiRecipes.map((recipe) => (_jsxs(View, { style: styles.card, children: [_jsx(Text, { style: styles.recipeBadge, children: "AI" }), _jsx(Text, { style: styles.recipeTitle, children: recipe.title }), _jsx(Text, { style: styles.recipeBody, children: recipe.description }), recipe.ingredients.length > 0 ? (_jsxs(Text, { style: [styles.recipeBody, { marginTop: 8 }], children: ["\u0406\u043D\u0433\u0440\u0435\u0434\u0456\u0454\u043D\u0442\u0438: ", recipe.ingredients.join(', ')] })) : null, recipe.steps.map((step, index) => (_jsxs(Text, { style: styles.recipeSteps, children: [index + 1, ". ", step] }, `${recipe.id}-step-${index}`)))] }, recipe.id)))] })] }), _jsx(Modal, { visible: manualProductModalOpen, transparent: true, animationType: "fade", onRequestClose: backFromManualProductStep, children: _jsx(View, { style: styles.detailOverlay, children: _jsxs(View, { style: styles.detailCard, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E" }), _jsx(Text, { style: styles.sectionText, children: "\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u043D\u0430\u0437\u0432\u0443 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0443 \u0456 \u043A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C, \u0434\u0430\u043B\u0456 \u0432\u0456\u0434\u043A\u0440\u0438\u0454\u0442\u044C\u0441\u044F \u0441\u043A\u0430\u043D \u0434\u0430\u0442\u0438 \u043F\u0440\u0438\u0434\u0430\u0442\u043D\u043E\u0441\u0442\u0456." }), _jsx(TextInput, { style: styles.input, placeholder: "\u041D\u0430\u0437\u0432\u0430 \u0442\u043E\u0432\u0430\u0440\u0443", placeholderTextColor: "#7f95a3", value: manualProductName, onChangeText: (value) => {
                                    setManualProductName(value);
                                    setManualProductCategory(inferProductCategory(value));
                                } }), _jsxs(Text, { style: styles.dateHint, children: ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F (\u0430\u0432\u0442\u043E): ", manualProductCategory || 'Інше'] }), _jsx(Pressable, { style: [styles.button, styles.buttonSecondary], onPress: () => void requestNameCamera(), disabled: nameCaptureBusy, children: _jsx(Text, { style: styles.buttonTextLight, children: nameCaptureBusy ? 'Зчитуємо…' : 'Сканувати назву з фото' }) }), _jsx(TextInput, { style: styles.input, placeholder: "\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C", placeholderTextColor: "#7f95a3", value: manualProductQuantity, onChangeText: (value) => setManualProductQuantity(value.replace(/\D/g, '').slice(0, 3)), keyboardType: "numeric", maxLength: 3 }), _jsx(Pressable, { style: [styles.button, styles.buttonSecondary], onPress: confirmManualProductEntry, children: _jsx(Text, { style: styles.buttonTextLight, children: "\u0414\u0430\u043B\u0456: \u0441\u043A\u0430\u043D \u0434\u0430\u0442\u0438" }) }), _jsx(Pressable, { style: styles.detailCloseButton, onPress: backFromManualProductStep, children: _jsx(Text, { style: styles.detailCloseText, children: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438" }) })] }) }) }), _jsx(Modal, { visible: scanning, transparent: true, animationType: "fade", onRequestClose: () => setScanning(false), children: _jsx(View, { style: styles.detailOverlay, children: _jsxs(View, { style: styles.detailCard, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u0421\u043A\u0430\u043D\u0435\u0440 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u0443" }), _jsx(Text, { style: styles.sectionText, children: "\u041D\u0430\u0432\u0435\u0434\u0456\u0442\u044C \u043A\u0430\u043C\u0435\u0440\u0443 \u043D\u0430 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u0442\u043E\u0432\u0430\u0440\u0443." }), permission?.granted ? (_jsx(View, { style: styles.scannerBox, children: _jsx(CameraView, { barcodeScannerSettings: {
                                        barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr']
                                    }, onBarcodeScanned: ({ data }) => {
                                        const raw = typeof data === 'string' ? data.trim() : '';
                                        if (!raw || scanConsumedRef.current) {
                                            return;
                                        }
                                        scanConsumedRef.current = true;
                                        setScanning(false);
                                        void handleLookup(raw);
                                    }, style: { flex: 1 } }) })) : (_jsx(Text, { style: styles.scannerHint, children: "\u041F\u043E\u0442\u0440\u0456\u0431\u0435\u043D \u0434\u043E\u0441\u0442\u0443\u043F \u0434\u043E \u043A\u0430\u043C\u0435\u0440\u0438." })), _jsx(Pressable, { style: styles.detailCloseButton, onPress: () => setScanning(false), children: _jsx(Text, { style: styles.detailCloseText, children: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438" }) })] }) }) }), _jsx(Modal, { visible: nameCameraOpen, transparent: true, animationType: "fade", onRequestClose: closeNameCameraAndReturn, children: _jsx(View, { style: styles.detailOverlay, children: _jsxs(View, { style: styles.detailCard, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u0421\u043A\u0430\u043D \u043D\u0430\u0437\u0432\u0438 \u0442\u043E\u0432\u0430\u0440\u0443" }), _jsx(Text, { style: styles.sectionText, children: "\u041D\u0430\u0432\u0435\u0434\u0456\u0442\u044C \u043A\u0430\u043C\u0435\u0440\u0443 \u043D\u0430 \u043D\u0430\u0437\u0432\u0443 \u043D\u0430 \u0443\u043F\u0430\u043A\u043E\u0432\u0446\u0456 \u0456 \u043D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \"\u0417\u0447\u0438\u0442\u0430\u0442\u0438 \u043D\u0430\u0437\u0432\u0443\"." }), _jsx(View, { style: styles.scannerBox, children: _jsx(CameraView, { ref: nameCameraRef, style: { flex: 1 } }) }), _jsx(Pressable, { style: [styles.button, styles.buttonSecondary], onPress: () => void captureProductNameFromPhoto(), disabled: nameCaptureBusy, children: _jsx(Text, { style: styles.buttonTextLight, children: nameCaptureBusy ? 'Зчитуємо…' : 'Зчитати назву' }) }), _jsx(PhotoProcessingOverlay, { inline: true, overlayInParent: true, visible: nameCaptureBusy, label: "\u0420\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u0454\u043C\u043E \u043D\u0430\u0437\u0432\u0443 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0443" }), _jsx(Pressable, { style: styles.detailCloseButton, onPress: closeNameCameraAndReturn, children: _jsx(Text, { style: styles.detailCloseText, children: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438" }) })] }) }) }), _jsx(Modal, { visible: expiryCameraOpen, transparent: true, animationType: "fade", onRequestClose: () => setExpiryCameraOpen(false), children: _jsx(View, { style: styles.detailOverlay, children: _jsxs(View, { style: styles.detailCard, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u0421\u043A\u0430\u043D \u0434\u0430\u0442\u0438 \u043F\u0440\u0438\u0434\u0430\u0442\u043D\u043E\u0441\u0442\u0456" }), _jsx(Text, { style: styles.sectionText, children: "\u041D\u0430\u0432\u0435\u0434\u0456\u0442\u044C \u043A\u0430\u043C\u0435\u0440\u0443 \u043D\u0430 \u0434\u0430\u0442\u0443 \u043D\u0430 \u0443\u043F\u0430\u043A\u043E\u0432\u0446\u0456. \u042F\u043A\u0449\u043E \u043D\u0435 \u0432\u0438\u0439\u0434\u0435 \u2014 \u0454 \u0440\u0443\u0447\u043D\u0438\u0439 \u0432\u0432\u0456\u0434." }), _jsx(View, { style: styles.scannerBox, children: _jsx(CameraView, { ref: expiryCameraRef, style: { flex: 1 } }) }), _jsx(Pressable, { style: [styles.button, styles.buttonSecondary], onPress: () => void captureExpiryFromPhoto(), disabled: expiryCaptureBusy, children: _jsx(Text, { style: styles.buttonTextLight, children: expiryCaptureBusy ? 'Зчитуємо…' : 'Зчитати дату' }) }), _jsx(PhotoProcessingOverlay, { inline: true, overlayInParent: true, visible: expiryCaptureBusy, label: "\u0420\u043E\u0437\u043F\u0456\u0437\u043D\u0430\u0454\u043C\u043E \u0434\u0430\u0442\u0443 \u043F\u0440\u0438\u0434\u0430\u0442\u043D\u043E\u0441\u0442\u0456" }), _jsx(Pressable, { style: [styles.button, styles.buttonSecondary], onPress: () => {
                                    setExpiryCameraOpen(false);
                                    setTimeout(() => {
                                        setManualDateModalOpen(true);
                                    }, 60);
                                }, disabled: expiryCaptureBusy, children: _jsx(Text, { style: styles.buttonTextLight, children: "\u0412\u0432\u0435\u0441\u0442\u0438 \u0434\u0430\u0442\u0443 \u0432\u0440\u0443\u0447\u043D\u0443" }) }), _jsx(Pressable, { style: styles.detailCloseButton, onPress: () => setExpiryCameraOpen(false), children: _jsx(Text, { style: styles.detailCloseText, children: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438" }) })] }) }) }), _jsx(Modal, { visible: manualDateModalOpen, transparent: true, animationType: "fade", onRequestClose: backFromManualDateStep, children: _jsx(View, { style: styles.detailOverlay, children: _jsxs(View, { style: styles.detailCard, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u0414\u0430\u0442\u0430 \u0432\u0440\u0443\u0447\u043D\u0443" }), _jsx(Text, { style: styles.sectionText, children: "\u0412\u043A\u0430\u0436\u0456\u0442\u044C \u0434\u0435\u043D\u044C, \u043C\u0456\u0441\u044F\u0446\u044C \u0456 \u0440\u0456\u043A, \u0434\u0430\u043B\u0456 \u0432\u0438\u0431\u0435\u0440\u0435\u0442\u0435 \u043C\u0456\u0441\u0446\u0435 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u043D\u043D\u044F." }), _jsxs(View, { style: styles.expiryRow, children: [_jsx(TextInput, { style: [styles.input, styles.expiryInput], placeholder: "DD", placeholderTextColor: "#7f95a3", value: expirationDay, onChangeText: (value) => setExpirationDay(value.replace(/\D/g, '').slice(0, 2)), keyboardType: "numeric", maxLength: 2 }), _jsx(TextInput, { style: [styles.input, styles.expiryInput], placeholder: "MM", placeholderTextColor: "#7f95a3", value: expirationMonth, onChangeText: (value) => setExpirationMonth(value.replace(/\D/g, '').slice(0, 2)), keyboardType: "numeric", maxLength: 2 }), _jsx(TextInput, { style: [styles.input, styles.expiryInputYear], placeholder: "YYYY", placeholderTextColor: "#7f95a3", value: expirationYear, onChangeText: (value) => setExpirationYear(value.replace(/\D/g, '').slice(0, 4)), keyboardType: "numeric", maxLength: 4 })] }), _jsx(Pressable, { style: [styles.button, styles.buttonSecondary], onPress: confirmManualDateEntry, children: _jsx(Text, { style: styles.buttonTextLight, children: "\u0414\u0430\u043B\u0456: \u043C\u0456\u0441\u0446\u0435 \u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043D\u044F" }) }), _jsx(Pressable, { style: styles.detailCloseButton, onPress: backFromManualDateStep, children: _jsx(Text, { style: styles.detailCloseText, children: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438" }) })] }) }) }), _jsx(Modal, { visible: finalizeModalOpen, transparent: true, animationType: "fade", onRequestClose: backFromFinalizeStep, children: _jsx(View, { style: styles.detailOverlay, children: _jsxs(View, { style: styles.detailCard, children: [_jsx(Text, { style: styles.sectionTitle, children: "\u0424\u0456\u043D\u0430\u043B\u044C\u043D\u0438\u0439 \u043A\u0440\u043E\u043A" }), _jsxs(Text, { style: styles.sectionText, children: ["\u0422\u043E\u0432\u0430\u0440: ", productName || '—', '\n', "\u0414\u0430\u0442\u0430: ", expirationYear, "-", expirationMonth, "-", expirationDay] }), _jsx(Text, { style: styles.dateHint, children: "\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C" }), _jsx(QuantityWheel, { value: Math.max(1, Number(quantity) || 1), onChange: (next) => setQuantity(String(next)) }), _jsx(View, { style: styles.locationRow, children: LOCATION_OPTIONS.map((option) => (_jsx(Pressable, { style: [styles.locationOption, location === option.value ? styles.locationOptionActive : undefined], onPress: () => setLocation(option.value), children: _jsx(Text, { style: styles.locationOptionText, children: option.label }) }, option.value))) }), _jsx(Pressable, { style: styles.button, onPress: () => void handleAddItem(), children: _jsx(Text, { style: styles.buttonText, children: "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u043F\u0440\u043E\u0434\u0443\u043A\u0442" }) }), _jsx(Pressable, { style: styles.detailCloseButton, onPress: backFromFinalizeStep, children: _jsx(Text, { style: styles.detailCloseText, children: "\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438" }) })] }) }) }), _jsx(Modal, { visible: Boolean(selectedInventoryItem), transparent: true, animationType: "fade", onRequestClose: () => setSelectedInventoryItem(null), children: _jsx(View, { style: styles.detailOverlay, children: _jsxs(View, { style: styles.detailCard, children: [selectedInventoryItem ? (_jsxs(_Fragment, { children: [_jsx(Text, { style: styles.detailTitle, children: selectedInventoryItem.name }), _jsxs(Text, { style: styles.detailLine, children: ["\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434: ", selectedInventoryItem.barcode] }), _jsxs(Text, { style: styles.detailLine, children: ["\u041A\u0456\u043B\u044C\u043A\u0456\u0441\u0442\u044C: ", selectedInventoryItem.quantity, " \u0448\u0442."] }), _jsxs(Text, { style: styles.detailLine, children: ["\u041C\u0456\u0441\u0446\u0435: ", formatLocationLabel(selectedInventoryItem.location)] }), _jsxs(Text, { style: styles.detailLine, children: ["\u0422\u0435\u0440\u043C\u0456\u043D \u043F\u0440\u0438\u0434\u0430\u0442\u043D\u043E\u0441\u0442\u0456: ", formatExpirationLabel(selectedInventoryItem)] }), _jsxs(Text, { style: styles.detailLine, children: ["\u0421\u0442\u0430\u0442\u0443\u0441: ", formatStatusLabel(selectedInventoryItem.insight.status)] }), _jsx(Text, { style: styles.detailLine, children: formatShelfLifeLabel(selectedInventoryItem) }), selectedInventoryItem.category ? _jsxs(Text, { style: styles.detailLine, children: ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F: ", selectedInventoryItem.category] }) : null, _jsx(Pressable, { style: [styles.detailAction, aiSelectedItemIds.includes(selectedInventoryItem.id) ? styles.aiPickButtonActive : undefined], onPress: () => toggleAiItemSelection(selectedInventoryItem.id), children: _jsx(Text, { style: styles.detailActionText, children: aiSelectedItemIds.includes(selectedInventoryItem.id) ? 'Прибрати з AI помічника' : 'Додати до AI помічника' }) }), _jsx(Pressable, { style: styles.detailAction, onPress: () => {
                                            const target = selectedInventoryItem.location === 'fridge' ? 'freezer' : 'fridge';
                                            void handleMove(selectedInventoryItem, target);
                                        }, children: _jsx(Text, { style: styles.detailActionText, children: selectedInventoryItem.location === 'fridge'
                                                ? 'Перемістити в морозильну камеру'
                                                : 'Перемістити в холодильник' }) }), _jsx(Pressable, { style: [styles.detailAction, styles.detailDeleteAction], onPress: () => {
                                            requestDeleteItem(selectedInventoryItem.id);
                                        }, children: _jsx(Text, { style: styles.detailActionText, children: "\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u043F\u0440\u043E\u0434\u0443\u043A\u0442" }) })] })) : null, _jsx(Pressable, { style: styles.detailCloseButton, onPress: () => setSelectedInventoryItem(null), children: _jsx(Text, { style: styles.detailCloseText, children: "\u0417\u0430\u043A\u0440\u0438\u0442\u0438" }) })] }) }) })] }));
}
