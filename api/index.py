from flask import Flask, request, render_template, jsonify, session, redirect, url_for
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import google.generativeai as genai
from pymongo import MongoClient
from authlib.integrations.flask_client import OAuth
import hashlib
import json
import os
from datetime import datetime
from bson import ObjectId
from dotenv import load_dotenv
from bson.objectid import ObjectId


load_dotenv()

genai.configure(api_key=os.getenv("API"))
    
app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")

limiter = Limiter(get_remote_address, app=app, default_limits=["50 per day"])
client = genai.GenerativeModel("gemini-2.0-flash")


mongo_client = MongoClient(os.getenv("URI"))
db = mongo_client['coursegen']
courses_collection = db['courses']
users_collection = db['users']
progress_collection = db['progress']

oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile'
    }
)

def get_prompt_hash(prompt):
    return hashlib.sha256(prompt.lower().strip().encode()).hexdigest()

def get_current_user():
    if 'user' in session:
        return session['user']
    return None

def makeQuestions(prompt):
    prompt = f"""
You are a generator that creates questions for a course.
You will be given the contents of a coding course, and your task is to generate questions that can be used to test the knowledge of the course.

CRITICAL: You MUST respond with ONLY valid JSON wrapped in ```json blocks. No other text before or after.

Create an array of question objects. Each question should be in this exact JSON format:
{{
    "q": "question text",
    "a1": "option 1", 
    "a2": "option 2",
    "a3": "option 3", 
    "a4": "option 4",
    "part": 0,
    "correct": "a1",
    "correct_explain": "Why a1 is correct"
}}

Guidelines:
- Generate 1-2 questions per course part
- Make questions challenging but fair
- Ensure one answer is clearly correct
- Use the 0-based index for the "part" field
- Each question should be multiple choice with exactly 4 options
- The "correct" field must be one of: "a1", "a2", "a3", or "a4"

Here is the course content: {prompt}

Remember: Respond with ONLY ```json [your json array here] ``` and nothing else."""
    
    response = client.generate_content(prompt)
    return response.text
@app.route("/api/course/<course_id>/progress", methods=["GET", "POST", "DELETE"])
def course_progress(course_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    try:
        oid = ObjectId(course_id)
    except Exception:
        return jsonify({"error": "Invalid course ID"}), 400
    if request.method == "GET":
        doc = progress_collection.find_one({
            "course_id": oid,
            "user_email": user['email']
        })
        if not doc:
            return jsonify({"progress": None}), 200

        course_doc = courses_collection.find_one({"_id": oid})
        if not course_doc:
            return jsonify({"error": "Course not found"}), 404

        try:
            course_data = json.loads(course_doc['course_data'])
            total_parts = len(course_data.get('c', []))
        except Exception:
            total_parts = 0

        progress = doc.get("progress", {})
        completed_parts = len(progress.get("completedParts", []))
        percent = int((completed_parts / total_parts) * 100) if total_parts > 0 else 0
        progress['percent'] = percent

        return jsonify({"progress": progress}), 200

    
    elif request.method == "POST":
        data = request.get_json() or {}
        
        
        
        if "progress" in data:
            progress = data.get("progress")
        else:
            
            progress = data
        
        if not progress or not isinstance(progress, dict):
            return jsonify({"error": "No valid progress data provided"}), 400
        
        now = datetime.utcnow()
        result = progress_collection.update_one(
            {"course_id": oid, "user_email": user['email']},
            {"$set": {"progress": progress, "updated_at": now}},
            upsert=True
        )
        return jsonify({"success": True, "updated_at": now.isoformat()}), 200
    
    elif request.method == "DELETE":
        res = progress_collection.delete_one({
            "course_id": oid, "user_email": user['email']
        })
        return jsonify({"deleted": res.deleted_count > 0}), 200
    
@app.route("/gquestions", methods=["POST"])
def generateQuestion():
    data = request.get_json()
    prompt = data.get("prompt", "")
    prompt = prompt.strip()
    print(prompt)
    if not prompt:
        return {"error": "No prompt provided"}, 400
    try:
        response = makeQuestions(prompt)
        try:
            response = response.split("```json")[1].split("```")[0]
        except IndexError:
            pass
        return {"response": response}, 200
    except Exception as e:
        return {"error": str(e)}, 500

def courseGen(prompt):
    prompta = f"""
You are a course writer. You write courses that teach things to people as if they were beginners (Unless they specified difficulty).
You will be given a prompt that describes the course you need to write.

CRITICAL: You MUST respond with ONLY valid JSON wrapped in ```json blocks. No other text before or after.
For each course, you will create a w3school-style course outline with a title, description, language, and structured parts.

IMPORTANT: For code examples during coding questions, add a "s" (snippet) field alongside "t" (title) and "c" (content) in section objects.

Your task is to generate a course outline in JSON format with the following structure (This is an example of a course about Python. DO NOT just copy this example, create a new course based on the prompt):
{{
    "t": "Python for Beginners: A Comprehensive Introduction",
    "d": "This course provides a friendly and accessible introduction to Python programming.",
    "l": "python",
    "c": [
        {{
            "n": "Part 1: Getting Started with Python",
            "d": "Introduction to Python, installation, and basic syntax.",
            "s": [
                {{
                    "t": "Introduction to Python",
                    "c": "Python is a popular high-level programming language known for its readability and simplicity. It's used in web development, data science, automation, artificial intelligence, and more. Learning Python helps you build software, analyze data, and automate tasks efficiently."
                }},
                {{
                    "t": "Your First Python Program",
                    "c": "A Python program is a set of instructions executed by the Python interpreter. Let's start with a simple example to understand basic syntax.",
                    "s": "print('Hello, World!')\nname = 'Alice'\nprint(f'Hello, {{name}}!')"
                }},
                {{
                    "t": "Variables and Data Types",
                    "c": "Variables are used to store data. Python supports several basic data types: integers (whole numbers), floats (decimal numbers), strings (text), and booleans (True/False). Understanding these is essential for programming.",
                    "s": "age = 25\nheight = 5.9\nname = 'Alice'\nis_student = True\nprint(age, height, name, is_student)"
                }}
            ]
        }}
    ]
}}




Guidelines:
- DO NOT UNECESSARILY add snippets or copy from the example above. Create a unique course based on the prompt.
- Use the "s" field ONLY for code snippets that should be displayed in code blocks
- If there is no need for a snippet, no need to add it at all. Just keep t and c
- Keep snippets practical and runnable
- Don't add snippets if they aren't for code
- Make each part comprehensive but concise (max 800 characters per part)
- Include practical examples and explanations
- Create 4-9 parts for a complete course
- Each part should have 4-6 segments

Here is the prompt: {prompt}

Remember: Respond with ONLY ```json [your json here] ``` and nothing else."""

    response = client.generate_content(prompta)
    return response.text

@app.route("/login")
def login():
    redirect_uri = "https://specters.dev/authorize"
    return google.authorize_redirect(redirect_uri)

@app.route("/authorize")
def authorize():
    try:
        token = google.authorize_access_token()
        print(f"Token received: {token}")
        
        user_info = token.get('userinfo')
        print(f"User info: {user_info}")
        
        if user_info:
            
            user = users_collection.find_one({"email": user_info['email']})
            if not user:
                users_collection.insert_one({
                    "email": user_info['email'],
                    "name": user_info.get('name'),
                    "picture": user_info.get('picture'),
                    "created_at": datetime.utcnow(),
                    "course_count": 1
                })
                print(f"New user created: {user_info['email']}")
            
            session['user'] = {
                "email": user_info['email'],
                "name": user_info.get('name'),
                "picture": user_info.get('picture')
            }
            print(f"Session set for user: {user_info['email']}")
        
        return redirect('/')
    except Exception as e:
        print(f"Authorization error: {e}")
        import traceback
        traceback.print_exc()
        return f"<h1>Authorization Error</h1><p>{str(e)}</p><a href='/'>Go back</a>", 500
    
@app.route("/logout")
def logout():
    session.pop('user', None)
    return redirect('/')

@app.route("/api/user", methods=["GET"])
def get_user():
    user = get_current_user()
    if not user:
        return jsonify({"logged_in": False}), 200
    
    course_count = courses_collection.count_documents({"user_email": user['email']})
    
    return jsonify({
        "logged_in": True,
        "name": user['name'],
        "email": user['email'],
        "picture": user.get('picture'),
        "course_count": course_count
    }), 200

@app.route("/api/user/courses", methods=["GET"])
def get_user_courses():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    
    courses = list(courses_collection.find(
        {"user_email": user['email']},
        {"_id": 1, "original_prompt": 1, "course_data": 1, "created_at": 1}
    ).sort("created_at", -1))
    
    
    result = []
    for course in courses:
        try:
            course_json = json.loads(course['course_data'])
            result.append({
                "id": str(course['_id']),
                "title": course_json.get('t', course['original_prompt']),
                "prompt": course['original_prompt'],
                "created_at": course.get('created_at', datetime.utcnow()).isoformat()
            })
        except:
            pass
    
    return jsonify({"courses": result}), 200

@app.route("/api/all/courses", methods=["GET"])
def get_all_courses():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    
    courses = list(courses_collection.find().sort("created_at", -1))
    
    result = []
    for course in courses:
        try:
            course_json = json.loads(course['course_data'])
            if len(result) == 5:
                break
            result.append({
                "id": str(course['_id']),
                "title": course_json.get('t', course['original_prompt']),
                "prompt": course['original_prompt'],
                "created_at": course.get('created_at', datetime.utcnow()).isoformat(),
                "author": str(course['user_email']).split("@")[0]
            })
        except:
            pass
    
    return jsonify({"courses": result}), 200

from bson.objectid import ObjectId
from flask import jsonify, request

@app.route("/api/course/<course_id>", methods=["GET", "DELETE"])
def get_course_by_id(course_id):
    if request.method == "GET":
        try:
            course = courses_collection.find_one({"_id": ObjectId(course_id)})
            if not course:
                return jsonify({"error": "Course not found"}), 404
            
            return jsonify({
                "course_data": course['course_data'],
                "prompt": course['original_prompt']
            }), 200
        except:
            return jsonify({"error": "Invalid course ID"}), 400

    elif request.method == "DELETE":
        try:
            result = courses_collection.delete_one({"_id": ObjectId(course_id)})
            if result.deleted_count == 0:
                return jsonify({"error": "Course not found"}), 404

            return jsonify({"message": "Course deleted successfully"}), 200
        except:
            return jsonify({"error": "Invalid course ID"}), 400

@app.route("/gc", methods=["POST"])
def generateCourse():
    data = request.get_json()
    prompt = data.get("content", "")
    prompt = prompt.strip()
    
    user = get_current_user()
    if not user:
        return {"error": "Not logged in"}, 401
    
    print(f"Received prompt: {prompt}")
    
    if not prompt:
        return {"error": "No prompt provided"}, 400
    
    try:
        prompt_hash = get_prompt_hash(prompt)
        
        
        existing_course = courses_collection.find_one({
            "prompt_hash": prompt_hash,
            "user_email": user['email']
        })
        
        if existing_course:
            print(f"Course found in cache for user: {user['email']}")
            return {"response": existing_course["course_data"], "course_id": str(existing_course['_id'])}, 200
        
        
        print(f"Generating new course for user: {user['email']}")
        response = courseGen(prompt)
        
        try:
            response = response.split("```json")[1].split("```")[0]
        except IndexError:
            pass
        
        
        course_doc = {
            "prompt_hash": prompt_hash,
            "original_prompt": prompt,
            "course_data": response,
            "user_email": user['email'],
            "created_at": datetime.utcnow()
        }
        result = courses_collection.insert_one(course_doc)
        
        
        users_collection.update_one(
            {"email": user['email']},
            {"$inc": {"course_count": 1}}
        )
        
        print(f"Course saved to database")
        
        return {"response": response, "course_id": str(result.inserted_id)}, 200
        
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}, 500

@app.route("/", methods=["GET"])
def index():
    return render_template("./index.html")

@app.route("/course", methods=["GET"])
def course():
    return render_template("./course.html")

if __name__ == "__main__":
    app.run(debug=True, port=4040)