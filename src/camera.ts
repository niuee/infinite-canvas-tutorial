import { Point } from "vector";
import { multiplyByScalar, rotateVector, vectorAddition, vectorSubtraction, getLineSegmentIntersection, dotProduct } from "./vector";
import { CameraObserver } from "./camera-observer"

export type PositionBoundary = {
    min: Point;
    max: Point;
}

export type ZoomLevelBoundary = {
    min: number;
    max: number;
}

type RotationBoundary = {
    start: number;
    end: number;
    positiveDirection: boolean;
    startForTieBreak: boolean;
}
class Camera {
    private _position: Point;
    private _zoomLevel: number;
    private _rotation: number;
    private _positionBoundary: PositionBoundary;
    private _zoomLevelBoundary: ZoomLevelBoundary;
    private _rotationBoundary?: RotationBoundary;

    public viewPortWidth: number;
    public viewPortHeight: number;

    public limitEntireViewPort: boolean;

    private _cameraObserver: CameraObserver;

    constructor(viewPortWidth: number = 500, viewPortHeight: number = 500, positionBoundary: PositionBoundary = {min: {x: -1000, y: -1000}, max: {x: 1000, y: 1000}}, zoomLevelBoundary: ZoomLevelBoundary = {min: 0.1, max: 10}){
        this._position = {x: 0, y: 0};
        this._zoomLevel = 1; // 縮放程度不能夠小於或是等於 0。
        this._rotation = 0;
        this._positionBoundary = positionBoundary;
        this._zoomLevelBoundary = zoomLevelBoundary;
        this.viewPortHeight = viewPortHeight;
        this.viewPortWidth = viewPortWidth;
        this.limitEntireViewPort = false;
        this._cameraObserver = new CameraObserver();
    }

    get positionBoundary(): PositionBoundary {
        return this._positionBoundary;
    }

    get zoomLevelBoundary(): ZoomLevelBoundary {
        return this._zoomLevelBoundary;
    }

    set zoomLevelBoundary(zoomLevelBoundary: ZoomLevelBoundary){
        if (zoomLevelBoundary.min > zoomLevelBoundary.max){
            const temp = zoomLevelBoundary.min;
            zoomLevelBoundary.min = zoomLevelBoundary.max;
            zoomLevelBoundary.max = temp;
        }
        this._zoomLevelBoundary = zoomLevelBoundary;
    }

    set rotationBoundary(rotationBoundary: RotationBoundary) {
        const validatedRotationBoundary = {...rotationBoundary};
        if (rotationBoundary.start > Math.PI * 2 || rotationBoundary.start < 0){
            validatedRotationBoundary.start = normalizeAngle(rotationBoundary.start);
        }
        if (rotationBoundary.end > Math.PI * 2 || rotationBoundary.end < 0){
            validatedRotationBoundary.end = normalizeAngle(rotationBoundary.end);
        }
        this._rotationBoundary = rotationBoundary;
    }

    get position(): Point {
        return this._position;
    }

    get zoomLevel(): number {
        return this._zoomLevel;
    }

    get rotation(): number {
        return this._rotation;
    }

    setPosition(destination: Point){
        if(this.limitEntireViewPort && !viewPortWithinPositionBoundary(this.viewPortWidth, this.viewPortHeight, destination, this._zoomLevel, this._rotation, this._positionBoundary)){
            return;
        }
        if(!withinPositionBoundary(destination, this._positionBoundary)){
            return;
        }
        const origin = {...this._position};
        this._position = destination;
        this._cameraObserver.notifyPan(origin, {...this._position}, {position: {...this._position}, zoomLevel: this._zoomLevel, rotation: this._rotation});
    }

    setPositionBy(offset: Point){
        const destination = vectorAddition(this._position, offset);
        if(this.limitEntireViewPort){
            this.setPosition(clampingEntireViewPort(this.viewPortWidth, this.viewPortHeight, destination, this._rotation, this._zoomLevel, this._positionBoundary));
            return;
        }
        const clampedDestination = simpleClamping(destination, this._positionBoundary);
        this.setPosition(clampedDestination);
    }

    setZoomLevelBy(deltaZoomLevel: number){
        this.setZoomLevel(this._zoomLevel + deltaZoomLevel);
    }
    
    setZoomLevel(targetZoom: number){
        if(!withinZoomLevelBoundary(targetZoom, this._zoomLevelBoundary)){
            return;
        }
        const origin = this._zoomLevel;
        this._zoomLevel = targetZoom;
        this._cameraObserver.notifyZoom(origin, this._zoomLevel, {position: {...this._position}, zoomLevel: this._zoomLevel, rotation: this._rotation});
    }
    
    setRotation(rotation: number){
        if(this._rotationBoundary != undefined && !rotationWithinBoundary(rotation, this._rotationBoundary)){
            return;
        }
        const origin = this._rotation;
        this._rotation = normalizeAngle(rotation);
        this._cameraObserver.notifyRotate(origin, this._rotation, {position: {...this._position}, zoomLevel: this._zoomLevel, rotation: this._rotation});
    }

    setRotationBy(deltaRotation: number){
        let targetAngle = normalizeAngle(this._rotation + deltaRotation);
        if(this._rotationBoundary){
            targetAngle = clampRotation(targetAngle, this._rotationBoundary);
        }
        this.setRotation(targetAngle);
    }

    transformViewPort2WorldSpace(point: Point): Point {
        return transformViewPort2WorldSpaceWithCameraAttributes(point, this._position, this._zoomLevel, this._rotation);
    }

    transformWorldSpace2ViewPort(point: Point): Point {
        const withOffset = vectorSubtraction(point, this._position);
        const scaled = multiplyByScalar(withOffset, this._zoomLevel);
        const rotated = rotateVector(scaled, -this._rotation);
        return rotated;
    }

    transformVector2WorldSpace(vector: Point): Point{
        return rotateVector(multiplyByScalar(vector, 1 / this._zoomLevel), this._rotation);
    }
}

function withinPositionBoundary(destination: Point, positionBoundary: PositionBoundary): boolean {
    if(destination.x > positionBoundary.max.x || destination.x < positionBoundary.min.x){
        return false;
    }
    if(destination.y > positionBoundary.max.y || destination.y < positionBoundary.min.y){
        return false;
    }
    return true;
}

export function simpleClamping(destination: Point, positionBoundary: PositionBoundary): Point {
    if(withinPositionBoundary(destination, positionBoundary)){
        return destination;
    }

    const res = {...destination};

    res.x = Math.min(res.x, positionBoundary.max.x);
    res.x = Math.max(res.x, positionBoundary.min.x);

    res.y = Math.min(res.y, positionBoundary.max.y);
    res.y = Math.max(res.y, positionBoundary.min.y);

    return res;
}

export function clampingV2(origin: Point, destination: Point, positionBoundary: PositionBoundary): Point {
    if (withinPositionBoundary(destination, positionBoundary)){
        return destination;
    }

    const topRight = {x: positionBoundary.max.x, y: positionBoundary.max.y};
    const bottomRight = {x: positionBoundary.max.x, y: positionBoundary.min.y};
    const topLeft = {x: positionBoundary.min.x, y: positionBoundary.max.y};
    const bottomLeft = {x: positionBoundary.min.x, y: positionBoundary.min.y};

    const surpassedTop = destination.y > topLeft.y;
    const surpassedRight = destination.x > topRight.x;
    const surpassedBottom = destination.y < bottomRight.y;
    const surpassedLeft = destination.x < bottomLeft.x;

    let manipulatePoint = {...destination};

    if(surpassedTop && surpassedRight){
        console.log("top right");
        return topRight;
    }
    if(surpassedTop && surpassedLeft){
        console.log("top left");
        return topLeft;
    }
    if(surpassedBottom && surpassedRight){
        console.log("bottom right");
        return bottomRight;
    }
    if(surpassedBottom && surpassedLeft){
        console.log("bottom left");
        return bottomLeft;
    }

    let boundaryStart = bottomRight;
    let boundaryEnd = topRight;
    
    if(surpassedTop){
        boundaryStart = topLeft;
        boundaryEnd = topRight;
    } else if(surpassedBottom){
        boundaryStart = bottomLeft;
        boundaryEnd = bottomRight;
    } else if(surpassedLeft){
        boundaryStart = bottomLeft;
        boundaryEnd = topLeft;
    }
    const res = getLineSegmentIntersection(origin, destination, boundaryStart, boundaryEnd);
    if(!res.intersects){
        throw new Error("should have intersection but cannot calculate one");
    }
    switch(res.intersections.intersectionType){
    case "point":
        manipulatePoint = {...res.intersections.intersectionPoint};
        break;
    case "interval":
        manipulatePoint = {...res.intersections.intervalEndPoint};
        break;
    default:
        throw new Error("with intersections but the type is unknown");
    }
    return manipulatePoint;
}

function transformViewPort2WorldSpaceWithCameraAttributes(point: Point, cameraPosition: Point, cameraZoomLevel: number, cameraRotation: number): Point{
    const scaledBack = multiplyByScalar(point, 1 / cameraZoomLevel);
    const rotatedBack = rotateVector(scaledBack, cameraRotation);
    const withOffset = vectorAddition(rotatedBack, cameraPosition);
    return withOffset;
}

function viewPortWithinPositionBoundary(viewPortWidth: number, viewPortHeight: number, cameraPosition: Point, cameraZoomLevel: number, cameraRotation: number, positionBoundary: PositionBoundary): boolean {
    const topLeftCorner = {x: -viewPortWidth / 2, y: viewPortHeight / 2};
    const topRightCorner = {x: viewPortWidth / 2, y: viewPortHeight / 2};
    const bottomLeftCorner = {x: -viewPortWidth / 2, y: -viewPortHeight / 2};
    const bottomRightCorner = {x: viewPortWidth / 2, y: -viewPortHeight / 2};
    
    const topLeftCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(topLeftCorner, cameraPosition, cameraZoomLevel, cameraRotation);
    const topRightCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(topRightCorner, cameraPosition, cameraZoomLevel, cameraRotation);
    const bottomLeftCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(bottomLeftCorner, cameraPosition, cameraZoomLevel, cameraRotation);
    const bottomRightCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(bottomRightCorner, cameraPosition, cameraZoomLevel, cameraRotation);
    
    return withinPositionBoundary(topLeftCornerTransformed, positionBoundary) && withinPositionBoundary(topRightCornerTransformed, positionBoundary) && withinPositionBoundary(bottomLeftCornerTransformed, positionBoundary) && withinPositionBoundary(bottomRightCornerTransformed, positionBoundary);
}

function clampingEntireViewPort(viewPortWidth: number, viewPortHeight: number, targetCameraPosition: Point, cameraRotation: number, cameraZoomLevel: number, positionBoundary: PositionBoundary): Point {
    const topLeftCorner = {x: -viewPortWidth / 2, y: viewPortHeight / 2};
    const topRightCorner = {x: viewPortWidth / 2, y: viewPortHeight / 2};
    const bottomLeftCorner = {x: -viewPortWidth / 2, y: -viewPortHeight / 2};
    const bottomRightCorner = {x: viewPortWidth / 2, y: -viewPortHeight / 2};
    
    const topLeftCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(topLeftCorner, targetCameraPosition, cameraZoomLevel, cameraRotation);
    const topRightCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(topRightCorner, targetCameraPosition, cameraZoomLevel, cameraRotation);
    const bottomLeftCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(bottomLeftCorner, targetCameraPosition, cameraZoomLevel, cameraRotation);
    const bottomRightCornerTransformed = transformViewPort2WorldSpaceWithCameraAttributes(bottomRightCorner, targetCameraPosition, cameraZoomLevel, cameraRotation);
    
    if( withinPositionBoundary(topLeftCornerTransformed, positionBoundary) && withinPositionBoundary(topRightCornerTransformed, positionBoundary) && withinPositionBoundary(bottomLeftCornerTransformed, positionBoundary) && withinPositionBoundary(bottomRightCornerTransformed, positionBoundary)){
        return targetCameraPosition;
    }   
    const topLeftCornerClamped = simpleClamping(topLeftCornerTransformed, positionBoundary);
    const topRightCornerClamped = simpleClamping(topRightCornerTransformed, positionBoundary);
    const bottomLeftCornerClamped = simpleClamping(bottomLeftCornerTransformed, positionBoundary);
    const bottomRightCornerClamped = simpleClamping(bottomRightCornerTransformed, positionBoundary);

    const topLeftCornerDelta = vectorSubtraction(topLeftCornerClamped, topLeftCornerTransformed);
    const topRightCornerDelta = vectorSubtraction(topRightCornerClamped, topRightCornerTransformed);
    const bottomLeftCornerDelta = vectorSubtraction(bottomLeftCornerClamped, bottomLeftCornerTransformed);
    const bottomRightCornerDelta = vectorSubtraction(bottomRightCornerClamped, bottomRightCornerTransformed);
    
    let diffs = [topLeftCornerDelta, topRightCornerDelta, bottomLeftCornerDelta, bottomRightCornerDelta];
    let maxXDiff = Math.abs(diffs[0].x);
    let maxYDiff = Math.abs(diffs[0].y);
    let delta = diffs[0];
    diffs.forEach((diff)=>{
        if(Math.abs(diff.x) > maxXDiff){
            maxXDiff = Math.abs(diff.x);
            delta.x = diff.x;
        }
        if(Math.abs(diff.y) > maxYDiff){
            maxYDiff = Math.abs(diff.y);
            delta.y = diff.y;
        }
    });

    return vectorAddition(delta, targetCameraPosition);
}

export function withinZoomLevelBoundary(zoomLevel: number, zoomLevelBoundary: ZoomLevelBoundary): boolean {
    return zoomLevel <= zoomLevelBoundary.max && zoomLevel >= zoomLevelBoundary.min;
}

export function getMinZoomLevel(viewPortWidth: number, viewPortHeight: number, positionBoundary: PositionBoundary): number{
    const minZoomLevelBasedOnWidth = viewPortWidth / (positionBoundary.max.x - positionBoundary.min.x);
    const minZoomLevelBasedOnHeight = viewPortHeight / (positionBoundary.max.y - positionBoundary.min.y);
    return minZoomLevelBasedOnWidth > minZoomLevelBasedOnHeight ? minZoomLevelBasedOnWidth : minZoomLevelBasedOnHeight;
}

export function getMinZoomLevelWithCameraRotation(viewPortWidth: number, viewPortHeight: number, positionBoundary: PositionBoundary): number {
    const steps = 10;
    let rotation = 0;
    const increment = Math.PI / (2 * steps);
    const boundaryWidth = positionBoundary.max.x - positionBoundary.min.x;
    const boundaryHeight = positionBoundary.max.y - positionBoundary.min.y;
    let maxMinWidthZoomLevel = viewPortWidth / boundaryWidth;
    let maxMinHeightZoomLevel = viewPortHeight / boundaryHeight;
    for(let i = 0;  i < steps + 1; i++){
        const widthPrime = viewPortHeight * Math.sin(rotation) + viewPortWidth * Math.cos(rotation);
        const heightPrime = viewPortHeight * Math.cos(rotation) + viewPortWidth * Math.sin(rotation);

        maxMinWidthZoomLevel = Math.max(maxMinWidthZoomLevel, widthPrime / boundaryWidth);
        maxMinHeightZoomLevel = Math.max(maxMinHeightZoomLevel, heightPrime / boundaryHeight);
        rotation += increment;
    }
    return maxMinWidthZoomLevel > maxMinHeightZoomLevel ? maxMinWidthZoomLevel : maxMinHeightZoomLevel;
}

function normalizeAngle(angle: number): number {
    let normalizedAngle = angle;
    normalizedAngle = normalizedAngle % (2 * Math.PI);
    if (normalizedAngle >= 0){
        return normalizedAngle;
    }
    return normalizedAngle + Math.PI * 2;
}

function deg2rad(degree: number): number {
    return degree * Math.PI / 180;
}

function rad2deg(radian: number): number {
    return radian * 180 / Math.PI;
}

function angleSpan(from: number, to: number): number {
    const normalizedFrom = normalizeAngle(from);
    const normalizedTo = normalizeAngle(to);

    const diff = normalizedTo - normalizedFrom;
    if(Math.abs(diff) <= Math.PI){
        return diff;
    }
    return diff - Math.PI * 2;
}

function rotationWithinBoundary(rotation: number, rotationBoundary: RotationBoundary): boolean {
    const normalizedRotation = normalizeAngle(rotation);
    let angleFromStart = normalizedRotation - rotationBoundary.start;
    if (angleFromStart < 0){
        angleFromStart += (Math.PI * 2);
    }
    if (!rotationBoundary.positiveDirection && angleFromStart > 0){
        angleFromStart = Math.PI * 2 - angleFromStart;
    }
    let angleRange = rotationBoundary.end - rotationBoundary.start;
    if(angleRange < 0){
        angleRange += (Math.PI * 2);
    }
    if(!rotationBoundary.positiveDirection && angleRange > 0){
        angleRange = Math.PI * 2 - angleRange;
    }

    return angleRange >= angleFromStart;
}

function clampRotation(rotation: number, rotationBoundary: RotationBoundary): number {
    if(rotationWithinBoundary(rotation, rotationBoundary)){
        return rotation;
    }

    const angleFromStart = angleSpan(rotationBoundary.start, rotation);
    const angleFromEnd = angleSpan(rotationBoundary.end, rotation);
    if (Math.abs(angleFromStart) < Math.abs(angleFromEnd)){
        return rotationBoundary.start;
    }
    if (Math.abs(angleFromStart) == Math.abs(angleFromEnd) && rotationBoundary.startForTieBreak){
        return rotationBoundary.start;
    }
    return rotationBoundary.end;
}

function restrictXTranslation(delta: Point): Point {
    return {x: 0, y: delta.y};
}

function restrictYTranslation(delta: Point): Point {
    return {x: delta.x, y: 0};
}

function restrictRelativeXTranslation(delta: Point, cameraRotation: number): Point {
    let verticalDirection = rotateVector({x: 0, y: 1}, cameraRotation);
    const magnitude = dotProduct(delta, verticalDirection);
    return multiplyByScalar(verticalDirection, magnitude);
}

function restrictRelativeYTranslation(delta: Point, cameraRotation: number): Point {
    let horizontalDirection = rotateVector({x: 1, y: 0}, cameraRotation);
    const magnitude = dotProduct(delta, horizontalDirection);
    return multiplyByScalar(horizontalDirection, magnitude);
}

export { Camera };
