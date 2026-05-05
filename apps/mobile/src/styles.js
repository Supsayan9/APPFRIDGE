import { StyleSheet } from 'react-native';
export const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#160f2b'
    },
    kuromiBackdropImage: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.28
    },
    kuromiBackdropOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(20, 10, 44, 0.74)'
    },
    kuromiDecorWrap: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
        paddingTop: 14,
        paddingBottom: 28,
        paddingHorizontal: 18
    },
    kuromiDecorTop: {
        alignSelf: 'flex-end',
        color: '#f5d0fe',
        fontSize: 22,
        opacity: 0.42
    },
    kuromiDecorBottom: {
        alignSelf: 'flex-start',
        color: '#d8b4fe',
        fontSize: 12,
        letterSpacing: 3,
        opacity: 0.4,
        fontWeight: '800'
    },
    content: {
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 42
    },
    hero: {
        backgroundColor: '#2b1f4a',
        borderRadius: 24,
        padding: 22,
        marginBottom: 18
    },
    heroHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12
    },
    heroHeaderTexts: {
        flex: 1
    },
    heroBadgeImage: {
        width: 58,
        height: 58,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: 'rgba(240, 171, 252, 0.7)'
    },
    eyebrow: {
        color: '#d8b4fe',
        fontSize: 12,
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 6
    },
    title: {
        color: '#f2f8ff',
        fontSize: 30,
        fontWeight: '800',
        marginBottom: 8
    },
    subtitle: {
        color: '#d1c4e9',
        fontSize: 15,
        lineHeight: 22
    },
    statRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 18
    },
    statCard: {
        flex: 1,
        backgroundColor: '#3d2d67',
        borderRadius: 18,
        padding: 14
    },
    statLabel: {
        color: '#c4b5fd',
        fontSize: 12,
        marginBottom: 6
    },
    statValue: {
        color: '#ffffff',
        fontSize: 24,
        fontWeight: '800'
    },
    section: {
        backgroundColor: '#24173f',
        borderRadius: 22,
        padding: 18,
        marginBottom: 16
    },
    sectionTitle: {
        color: '#f2f8ff',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 6
    },
    sectionText: {
        color: '#cbbbe7',
        fontSize: 14,
        marginBottom: 14
    },
    dateHint: {
        color: '#d8cdf0',
        fontSize: 12,
        marginTop: 2,
        marginBottom: 8
    },
    expiryRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center'
    },
    expiryInput: {
        flex: 1
    },
    expiryInputYear: {
        flex: 1.4
    },
    qtyWheelWrap: {
        height: 150,
        borderRadius: 14,
        backgroundColor: '#201436',
        borderWidth: 1,
        borderColor: '#5b3a8a',
        marginBottom: 12,
        overflow: 'hidden'
    },
    qtyWheelScroll: {
        flex: 1
    },
    qtyWheelContent: {
        paddingVertical: 53
    },
    qtyWheelCenterBand: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 53,
        height: 44,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.14)',
        zIndex: 2
    },
    qtyWheelItem: {
        height: 44,
        alignItems: 'center',
        justifyContent: 'center'
    },
    qtyWheelText: {
        color: '#bfa9de',
        fontSize: 20,
        fontWeight: '600'
    },
    qtyWheelTextActive: {
        color: '#f5ecff',
        fontSize: 24,
        fontWeight: '800'
    },
    inventoryGroupHeader: {
        marginTop: 6,
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    inventoryGroupPill: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5
    },
    inventoryGroupPillFridge: {
        backgroundColor: '#4c2c78'
    },
    inventoryGroupPillFreezer: {
        backgroundColor: '#3748a8'
    },
    inventoryGroupPillText: {
        color: '#f3ebff',
        fontSize: 13,
        fontWeight: '800'
    },
    inventoryGroupCount: {
        color: '#d9c7fb',
        fontSize: 13,
        fontWeight: '700'
    },
    inventoryGroupEmpty: {
        color: '#b9a7da',
        marginTop: 6
    },
    inventoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between'
    },
    inventoryTile: {
        width: '48.5%',
        minHeight: 132,
        backgroundColor: '#332252',
        borderRadius: 16,
        padding: 12,
        marginTop: 10
    },
    inventoryTileTop: {
        flexGrow: 1
    },
    inventoryTileTitle: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4
    },
    inventoryTileMeta: {
        color: '#d8cdf0',
        fontSize: 12,
        marginTop: 2
    },
    inventoryTileStatus: {
        color: '#f0abfc',
        fontSize: 12,
        marginTop: 8,
        fontWeight: '700'
    },
    inventoryDragHint: {
        color: '#bca9df',
        fontSize: 10,
        marginTop: 6
    },
    inventoryTileAiTag: {
        alignSelf: 'flex-start',
        marginTop: 8,
        backgroundColor: '#5b3a8a',
        color: '#f3e8ff',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        overflow: 'hidden',
        fontSize: 11,
        fontWeight: '800'
    },
    inventoryTileAiButton: {
        marginTop: 10,
        borderRadius: 10,
        backgroundColor: '#4c2c78',
        alignItems: 'center',
        paddingVertical: 8
    },
    inventoryTileAiButtonActive: {
        backgroundColor: '#7e22ce'
    },
    inventoryTileAiButtonText: {
        color: '#f7edff',
        fontSize: 12,
        fontWeight: '800'
    },
    aiNotice: {
        color: '#d4c6f2',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 4,
        marginBottom: 2
    },
    aiNoticeError: {
        color: '#ffb3b3'
    },
    aiNoticeOk: {
        color: '#a7f3d0'
    },
    button: {
        backgroundColor: '#a855f7',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 10
    },
    buttonSecondary: {
        backgroundColor: '#4c2c78'
    },
    buttonText: {
        color: '#f5ecff',
        fontWeight: '800'
    },
    buttonTextLight: {
        color: '#eff6fa',
        fontWeight: '700'
    },
    input: {
        backgroundColor: '#342055',
        color: '#ffffff',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10
    },
    locationRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10
    },
    locationOption: {
        flex: 1,
        backgroundColor: '#3a235c',
        borderRadius: 12,
        paddingVertical: 11,
        paddingHorizontal: 10,
        alignItems: 'center'
    },
    locationOptionActive: {
        backgroundColor: '#7e22ce'
    },
    locationOptionText: {
        color: '#f2eaff',
        fontSize: 13,
        fontWeight: '700'
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
    },
    settingTextWrap: {
        flex: 1
    },
    settingTitle: {
        color: '#f4ecff',
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4
    },
    settingHint: {
        color: '#d8cdf0',
        fontSize: 13
    },
    card: {
        backgroundColor: '#332252',
        borderRadius: 18,
        padding: 14,
        marginTop: 10
    },
    cardDanger: {
        borderWidth: 1,
        borderColor: '#ff7b7b'
    },
    cardWarn: {
        borderWidth: 1,
        borderColor: '#ffd166'
    },
    cardFresh: {
        borderWidth: 1,
        borderColor: '#4ade80'
    },
    cardTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700'
    },
    cardMeta: {
        color: '#d1c4e9',
        fontSize: 13,
        marginTop: 4
    },
    status: {
        color: '#f0abfc',
        marginTop: 8,
        fontWeight: '700'
    },
    aiPickButton: {
        marginTop: 10,
        alignSelf: 'flex-start',
        backgroundColor: '#4c2c78',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6
    },
    aiPickButtonActive: {
        backgroundColor: '#7e22ce'
    },
    aiPickText: {
        color: '#efe3ff',
        fontSize: 12,
        fontWeight: '700'
    },
    removeText: {
        color: '#fda4af',
        fontWeight: '700',
        marginTop: 10
    },
    aiSelectionText: {
        color: '#d9c7fb',
        fontSize: 13,
        marginBottom: 8
    },
    aiClearButton: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: '#3f2a63',
        marginBottom: 10
    },
    aiClearButtonText: {
        color: '#f1e8ff',
        fontSize: 12,
        fontWeight: '700'
    },
    scannerBox: {
        overflow: 'hidden',
        borderRadius: 18,
        height: 260,
        marginBottom: 12
    },
    scannerHint: {
        color: '#ddd6fe',
        textAlign: 'center',
        marginTop: 8
    },
    recipeTitle: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 16,
        marginBottom: 6
    },
    recipeBody: {
        color: '#ded1f2',
        fontSize: 14,
        lineHeight: 20
    },
    recipeBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#5b3a8a',
        color: '#e9d5ff',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden'
    },
    recipeSteps: {
        color: '#e7ddf7',
        fontSize: 13,
        lineHeight: 20,
        marginTop: 6
    },
    detailOverlay: {
        flex: 1,
        backgroundColor: 'rgba(7, 4, 16, 0.75)',
        justifyContent: 'center',
        paddingHorizontal: 18
    },
    detailCard: {
        backgroundColor: '#2d1b4d',
        borderRadius: 18,
        padding: 16
    },
    detailTitle: {
        color: '#ffffff',
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 8
    },
    detailLine: {
        color: '#dcd0f3',
        fontSize: 14,
        marginTop: 5
    },
    detailAction: {
        marginTop: 12,
        borderRadius: 12,
        paddingVertical: 11,
        alignItems: 'center',
        backgroundColor: '#4c2c78'
    },
    detailDeleteAction: {
        backgroundColor: '#7d2f52'
    },
    detailActionText: {
        color: '#f7eeff',
        fontWeight: '700'
    },
    detailCloseButton: {
        marginTop: 12,
        alignItems: 'center'
    },
    detailCloseText: {
        color: '#d8c8f4',
        fontWeight: '700'
    },
    processingOverlay: {
        flex: 1,
        backgroundColor: 'rgba(10, 8, 22, 0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 26
    },
    processingInlineWrap: {
        marginTop: 8,
        marginBottom: 4
    },
    processingInlineOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10, 8, 22, 0.82)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: 18,
        zIndex: 20
    },
    processingCard: {
        width: '100%',
        maxWidth: 320,
        borderRadius: 22,
        backgroundColor: '#22143d',
        borderWidth: 1,
        borderColor: '#7e22ce',
        padding: 20,
        alignItems: 'center'
    },
    processingFridge: {
        width: 84,
        height: 118,
        borderRadius: 16,
        backgroundColor: '#9ec6ff',
        borderWidth: 2,
        borderColor: '#dbeafe',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
        overflow: 'hidden'
    },
    processingFridgeGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(191, 219, 254, 0.45)'
    },
    processingShelfTop: {
        position: 'absolute',
        left: 14,
        right: 14,
        top: 28,
        height: 3,
        borderRadius: 4,
        backgroundColor: 'rgba(96, 165, 250, 0.75)',
        justifyContent: 'center'
    },
    processingShelfBottom: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 26,
        height: 3,
        borderRadius: 4,
        backgroundColor: 'rgba(96, 165, 250, 0.75)',
        justifyContent: 'center'
    },
    processingFoodDotA: {
        position: 'absolute',
        left: 8,
        width: 10,
        height: 10,
        borderRadius: 99,
        backgroundColor: '#f59e0b',
        top: -4
    },
    processingFoodDotB: {
        position: 'absolute',
        right: 12,
        width: 9,
        height: 9,
        borderRadius: 99,
        backgroundColor: '#34d399',
        top: -3
    },
    processingFoodDotC: {
        position: 'absolute',
        left: 20,
        width: 11,
        height: 11,
        borderRadius: 99,
        backgroundColor: '#f472b6',
        top: -4
    },
    processingFridgeDoor: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 64,
        backgroundColor: '#bfdbfe',
        borderRightWidth: 2,
        borderColor: '#93c5fd'
    },
    processingFridgeHandle: {
        position: 'absolute',
        right: 12,
        width: 4,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#1d4ed8'
    },
    processingSnowA: {
        position: 'absolute',
        left: 9,
        top: 8,
        fontSize: 13
    },
    processingSnowB: {
        position: 'absolute',
        right: 7,
        bottom: 8,
        fontSize: 12
    },
    processingTitle: {
        color: '#f5ecff',
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 8
    },
    processingText: {
        color: '#d9c7fb',
        fontSize: 14,
        textAlign: 'center'
    }
});
